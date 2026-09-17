// Jev preference review — template. Copy to e.g. scripts/jev-review.mjs and adapt.
// SETUP (from interview): prefs source, gates vs advisory, thresholds, diff scope.
// Stacks: default Vercel AI Gateway (npm i ai@^7 @ai-sdk/gateway, env AI_GATEWAY_API_KEY).
//   Direct TypeSafe fallback (npm i @typesafe-ai/sdk, env TYPESAFE_API_KEY) is
//   handled below by mapping boolean->noul. Python (typesafe-sdk) and shell
//   (ai-cli) need a different file — see references/jev-essentials.md.
// Usage: node scripts/jev-review.mjs [--diff <git-ref>] [--dry-run]
//   empty --diff = working tree (staged + unstaged) vs HEAD.
//   PR / base-branch review: node scripts/jev-review.mjs --diff origin/main...HEAD
//   (--diff also accepts --diff=REF form.)
// Exit codes: 0 = approve/advisory (see stdout), 1 = gate violated (fix + re-run),
//   2 = infra/config error (no key, bad ref, missing dep). Max 3 fix re-runs, then escalate.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// --- EDIT ME: prefs extracted from CLAUDE.md / AGENTS.md (snake_case ids) ---
const PREFS = [
  // { id: "pref_01", gate: true, text: "No TypeScript `any` outside test fixtures." },
  // { id: "pref_02", gate: true, text: "Early returns; max nesting depth 2." },
  // { id: "pref_03", gate: false, text: "Conventional commit style in messages." },
];
// Two knobs with the same default: gates fail the run, advisories only note.
// Calibrate on 5-10 labeled diffs (see references/prefs-to-questions.md) and
// record the chosen values here.
const GATE_THRESHOLD = 0.7;
const ADVISORY_THRESHOLD = 0.7;
// Fail threshold on the 0..2 severity rubric; calibrate alongside the above.
const SEVERITY_FAIL = 1.5;
const MAX_DIFF_CHARS = 24000;
// Live Jev call budget; exceeding it exits 2 rather than hanging the agent loop.
const JEV_TIMEOUT_MS = 60000;

// Supports both `--diff REF` and `--diff=REF`. A bare `--diff` (or omitted)
// means working tree. Unknown `--diff=...` values must never silently fall
// back to working tree, so `=` splitting happens here, not downstream.
const args = {};
{
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      args[a.slice(2, eq)] = a.slice(eq + 1) || true;
    } else {
      const next = raw[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[a.slice(2)] = next;
        i++;
      } else {
        args[a.slice(2)] = true;
      }
    }
  }
}
const diffRef = args.diff && args.diff !== true ? String(args.diff) : null;
const dryRun = "dry-run" in args;

function assertSafeRef(ref) {
  if (!/^[A-Za-z0-9_.\-/~:^{}]+$/.test(ref)) {
    console.error(`review-error: unsafe --diff ref ${JSON.stringify(ref)}`);
    process.exit(2);
  }
}

function runGit(gitArgs, quiet, cwd) {
  return execFileSync("git", gitArgs, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: quiet ? ["ignore", "pipe", "ignore"] : undefined,
    cwd,
  });
}

function truncate(s, cap) {
  if (s.length <= cap) return { text: s, truncated: false };
  return { text: s.slice(0, cap), truncated: true };
}

function hasHead(cwd) {
  try {
    runGit(["rev-parse", "--verify", "HEAD"], true, cwd);
    return true;
  } catch {
    return false;
  }
}

function repoTop() {
  try {
    return runGit(["rev-parse", "--show-toplevel"], true).trim();
  } catch {
    return ".";
  }
}

function branch(cwd) {
  try {
    return runGit(["rev-parse", "--abbrev-ref", "HEAD"], true, cwd).trim();
  } catch {
    return "(unknown)";
  }
}

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".avif",
  ".zip", ".gz", ".tgz", ".tar", ".7z", ".pdf", ".woff", ".woff2",
  ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".mov", ".wav", ".exe",
  ".dll", ".so", ".dylib", ".bin", ".dat", ".lock",
]);

// Contents of new (untracked) files, capped to fit the remaining state budget.
// Without this, a brand-new file violating every pref would review as clean.
// Paths from git are repo-root-relative, so resolve against the repo top level
// (the script may run from a subdirectory). Binaries are skipped, never decoded.
function untrackedContent(top, list, budget) {
  const out = [];
  let used = 0;
  for (const f of list.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20)) {
    try {
      if (BINARY_EXT.has(extname(f).toLowerCase())) {
        out.push(`--- new file: ${f} (binary, skipped) ---`);
        continue;
      }
      const abs = join(top, f);
      if (statSync(abs).size > 20000) {
        out.push(`--- new file: ${f} (too large, skipped) ---`);
        continue;
      }
      const buf = readFileSync(abs);
      if (buf.includes(0)) {
        out.push(`--- new file: ${f} (binary, skipped) ---`);
        continue;
      }
      const c = buf.toString("utf8");
      if (used + c.length > budget) {
        out.push(`--- new file: ${f} (budget exceeded, skipped) ---`);
        continue;
      }
      used += c.length;
      out.push(`--- new file: ${f} ---\n${c}`);
    } catch {
      out.push(`--- new file: ${f} (unreadable, skipped) ---`);
    }
  }
  return out.join("\n");
}

function gitState() {
  if (diffRef) assertSafeRef(diffRef);
  // Anchor all git I/O at the repo root: pathspec "." and untracked listings
  // are cwd-scoped, so running from a subdirectory would otherwise review a subset.
  const top = repoTop();
  const head = hasHead(top);
  let rawDiff;
  if (diffRef) {
    rawDiff = runGit(["diff", diffRef, "--", ".", ":!package-lock.json", ":!pnpm-lock.yaml"], false, top);
  } else if (head) {
    rawDiff = runGit(["diff", "HEAD", "--", ".", ":!package-lock.json", ":!pnpm-lock.yaml"], false, top);
  } else {
    // No commits yet: HEAD does not exist. Combine staged + unstaged diffs.
    rawDiff = runGit(["diff", "--", ".", ":!package-lock.json", ":!pnpm-lock.yaml"], false, top)
      + runGit(["diff", "--cached", "--", ".", ":!package-lock.json", ":!pnpm-lock.yaml"], false, top);
  }
  const status = runGit(["status", "--porcelain"], false, top);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], false, top).trim();
  const stat = diffRef
    ? runGit(["diff", "--stat", diffRef], false, top)
    : head
      ? runGit(["diff", "--stat", "HEAD"], false, top)
      : runGit(["status", "--short"], false, top);
  let { text: diff, truncated } = truncate(rawDiff, MAX_DIFF_CHARS);
  if (untracked) {
    const extra = untrackedContent(top, untracked, MAX_DIFF_CHARS - diff.length);
    if (extra) {
      const combined = diff ? diff + "\n" + extra : extra;
      const t = truncate(combined, MAX_DIFF_CHARS);
      diff = t.text;
      truncated = truncated || t.truncated;
    }
  }
  return { diff, truncated, status: status.trim(), untracked, stat: stat.trim(), branch: branch(top) };
}

function buildQuestions() {
  const questions = {};
  for (const p of PREFS) {
    questions[p.id] = {
      // Gateway/AI SDK calls this "boolean"; native TypeSafe calls it "noul".
      // Same semantics; the direct-key path below maps boolean->noul automatically.
      type: "boolean",
      instructions: `Does \`diff\` violate ${p.id} (${p.text})? Answer true only for a concrete violation in the changed lines.`,
    };
  }
  questions.severity = {
    type: "score",
    instructions: "How far does `diff` drift from `prefs`?",
    criteria: ["No drift", "Minor drift; note only", "Blocks merge"],
  };
  questions.next = {
    type: "choice",
    instructions: "Which single review outcome applies to `diff` given `prefs`?",
    criteria: {
      approve: "Meets all prefs.",
      advisory: "Minor notes only; safe to continue.",
      fix_now: "A gate pref is violated; must fix before continuing.",
      other: "None of the above.",
    },
  };
  return questions;
}

async function evaluateGateway(state, questions) {
  const { experimental_evaluate: evaluate } = await import("ai").catch(() => {
    console.error("review-error: missing dep `ai`. Run: npm i ai@^7 @ai-sdk/gateway");
    process.exit(2);
  });
  return evaluate({ model: "typesafe-ai/jev", state, questions });
}

async function evaluateDirect(state, questions) {
  // NOTE: the direct-SDK response shape below was mapped from the documented
  // SDK surface, not a live call. Verify field names on the first live run
  // with TYPESAFE_API_KEY set; a shape mismatch surfaces as all-zero answers.
  const mod = await import("@typesafe-ai/sdk").catch(() => {
    console.error("review-error: missing dep `@typesafe-ai/sdk`. Run: npm i @typesafe-ai/sdk");
    process.exit(2);
  });
  const mapped = Object.fromEntries(
    Object.entries(questions).map(([k, q]) =>
      q.type === "boolean" ? [k, { ...q, type: "noul" }] : [k, q],
    ),
  );
  const client = new mod.TypeSafeClient();
  const res = await client.systemOne({ model: "jev-latest", state, questions: mapped });
  // Normalize direct-SDK shape to Gateway shape ({ probability } per boolean).
  const answers = {};
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === "boolean") {
      const a = res.answers?.[k] ?? res.nouls?.[k];
      answers[k] = { probability: a?.noul ?? a?.probability ?? 0 };
    } else if (q.type === "score") {
      const a = res.answers?.[k] ?? res.scores?.[k];
      answers[k] = { score: a?.score ?? 0 };
    } else {
      const a = res.answers?.[k] ?? res.choices?.[k];
      answers[k] = { choice: a?.choice ?? "other", probabilities: a?.probabilities };
    }
  }
  return { answers };
}

// Rejects the promise if the Jev call hangs, so a stuck request exits 2
// instead of blocking the agent loop forever.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  if (PREFS.length === 0) {
    console.error("review-error: no PREFS configured. Edit the PREFS array first.");
    process.exit(2);
  }
  let gs;
  try {
    gs = gitState();
  } catch (e) {
    console.error(`review-error: git failed: ${e.message}`);
    process.exit(2);
  }
  if (!gs.diff.trim() && !gs.untracked) {
    console.log("approve: no changes detected.");
    return;
  }
  const state = {
    prefs: PREFS.map((p) => `${p.id} [${p.gate ? "gate" : "advisory"}]: ${p.text}`),
    diff: gs.diff,
    untracked_files: gs.untracked || "(none)",
    git_status: gs.status || "(clean)",
    diff_stat: gs.stat || "(empty)",
    context: `branch ${gs.branch}, scope ${diffRef ?? "working-tree"}`,
    note: gs.truncated
      ? `diff truncated to ${MAX_DIFF_CHARS} chars; review covers the leading portion only.`
      : "full diff included.",
  };
  const questions = buildQuestions();

  if (dryRun) {
    console.log(JSON.stringify({
      mode: process.env.AI_GATEWAY_API_KEY ? "gateway" : process.env.TYPESAFE_API_KEY ? "direct" : "no-key",
      state: { ...state, diff: state.diff.slice(0, 2000) + (state.diff.length > 2000 ? "…(truncated preview)" : "") },
      questions,
    }, null, 2));
    return;
  }

  let result;
  try {
    if (process.env.AI_GATEWAY_API_KEY) {
      result = await withTimeout(evaluateGateway(state, questions), JEV_TIMEOUT_MS);
    } else if (process.env.TYPESAFE_API_KEY || process.env.TYPESAFE_AI_API_KEY) {
      result = await withTimeout(evaluateDirect(state, questions), JEV_TIMEOUT_MS);
    } else {
      console.error("review-error: set AI_GATEWAY_API_KEY or TYPESAFE_API_KEY.");
      process.exit(2);
    }
  } catch (e) {
    console.error(`review-error: jev call failed: ${e.message}`);
    process.exit(2);
  }

  const failures = [];
  const notes = [];
  for (const p of PREFS) {
    const prob = result.answers[p.id]?.probability ?? 0;
    if (prob >= (p.gate ? GATE_THRESHOLD : ADVISORY_THRESHOLD)) (p.gate ? failures : notes).push(`${p.id} P=${prob.toFixed(2)} ${p.text}`);
  }
  const severity = result.answers.severity?.score ?? 0;
  const next = result.answers.next?.choice ?? "other";

  if (failures.length > 0 || next === "fix_now" || severity >= SEVERITY_FAIL) {
    console.log(`fix_now (severity=${severity.toFixed(2)}, next=${next}):\n- ${[...failures, ...notes].join("\n- ")}`);
    process.exit(1);
  }
  if (notes.length > 0 || next === "advisory") {
    console.log(`advisory (severity=${severity.toFixed(2)}):\n- ${notes.join("\n- ") || "minor notes"}`);
    return;
  }
  console.log(`approve (severity=${severity.toFixed(2)}, next=${next})`);
}

main().catch((e) => {
  console.error(`review-error: ${e.message}`);
  process.exit(2);
});
