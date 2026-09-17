// review-pr.js — driver for the jev-pref/review action. Dependency-free
// (node builtins only). Reads INPUT_* env, runs the engine, posts a sticky
// PR comment, emits file annotations, maps outcome+fail-on to an exit code.
// Exit codes: 0 ok/approve/skipped/dry-run, 1 gate failure (per fail-on),
// 2 usage error, 1 also on engine infra errors (loud setup failures).
import { execFile as execFileCb } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFile = promisify(execFileCb);
const MARKER = "<!-- jev-pref-review -->";
const out = (s) => process.stdout.write(s + "\n");
const errOut = (s) => process.stderr.write(s + "\n");

function globToRegExp(glob) {
  // Minimal glob: ** matches any depth, * matches within a segment, ? one char.
  let re = "";
  const parts = glob.trim().split("/");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === "**") {
      re += "(?:.*/)?";
      continue;
    }
    re += p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
    if (i < parts.length - 1) re += "/";
  }
  return new RegExp(`^${re}$`);
}

function splitList(v) {
  return v.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
}

function matchesAny(file, patterns) {
  return patterns.some((p) => globToRegExp(p).test(file));
}

async function sh(cmd, args, { cwd }) {
  const { stdout } = await execFile(cmd, args, { cwd, encoding: "utf8", timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function loadEvent() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return {};
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}

async function ghFetch(url, token, { method = "GET", body } = {}) {
  const base = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub API ${method} ${url} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return null;
  return res.json();
}

function commentBody({ outcome, suites, base, head, runUrl }) {
  const icon = outcome === "fix_now" ? "❌" : outcome === "advisory" ? "⚠️" : "✅";
  const lines = [`${MARKER}`, `## ${icon} jev-pref: ${outcome}`, ""];
  lines.push(`Reviewed \`${base}\`...${head} · suites: ${suites.map((s) => `${s.suite}=\`${s.outcome}\``).join(", ")}`);
  lines.push("");
  for (const s of suites) {
    const items = [...s.failures, ...s.notes];
    lines.push(`<details><summary><b>${s.suite}</b> — ${s.outcome}</summary>`, "");
    lines.push(items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "_clean_");
    lines.push("", "</details>", "");
  }
  if (runUrl) lines.push(`<sub>Full log: [workflow run](${runUrl}) · gate failures block merge per \`fail-on\`.</sub>`);
  let body = lines.join("\n");
  // GitHub issue comments cap at 65536 chars — truncate verdict lists, never
  // the header, and point at the log for the rest.
  if (body.length > 60000) {
    body = `${body.slice(0, 60000)}\n\n_(truncated: full verdict in the workflow log)_`;
  }
  return body;
}

async function upsertComment({ repo, number, token, body }) {
  const comments = await ghFetch(`/repos/${repo}/issues/${number}/comments?per_page=100`, token);
  const existing = comments.find((c) => typeof c.body === "string" && c.body.includes(MARKER));
  if (existing) {
    await ghFetch(`/repos/${repo}/issues/comments/${existing.id}`, token, { method: "PATCH", body: { body } });
  } else {
    await ghFetch(`/repos/${repo}/issues/${number}/comments`, token, { method: "POST", body: { body } });
  }
}

function emitOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  const line = `${name}=${value}`;
  if (file) return appendFile(file, line + "\n");
  out(`output ${line}`);
}

/**
 * Normalize engine verdict shapes: whole-diff ({ outcome, suites, files })
 * and per-hunk ({ outcome, hunks: [{ label, suites }], files }). Hunk mode
 * aggregates per-suite with [file:line] item prefixes so the sticky comment
 * keeps file attribution.
 */
function normalizeVerdict(v) {
  if (v && Array.isArray(v.suites)) {
    return { outcome: v.outcome ?? "error", suites: v.suites, files: v.files ?? [] };
  }
  if (v && Array.isArray(v.hunks)) {
    const bySuite = new Map();
    for (const h of v.hunks) {
      for (const s of h.suites ?? []) {
        if (!bySuite.has(s.suite)) {
          bySuite.set(s.suite, { suite: s.suite, outcome: "approve", failures: [], notes: [] });
        }
        const agg = bySuite.get(s.suite);
        for (const f of s.failures ?? []) agg.failures.push(`[${h.label}] ${f}`);
        for (const n of s.notes ?? []) agg.notes.push(`[${h.label}] ${n}`);
        if (s.outcome === "fix_now") agg.outcome = "fix_now";
        else if (s.outcome === "advisory" && agg.outcome !== "fix_now") agg.outcome = "advisory";
      }
    }
    return { outcome: v.outcome ?? "error", suites: [...bySuite.values()], files: v.files ?? [] };
  }
  return { outcome: v?.outcome ?? "error", suites: [], files: [] };
}

async function main() {
  const inp = (n, def = "") => process.env[`INPUT_${n}`] ?? def;
  const suites = inp("SUITES", "prefs,secrets");
  const failOn = inp("FAIL_ON", "gates");
  const commentMode = inp("COMMENT_MODE", "both");
  const configPath = inp("CONFIG_PATH", "");
  const workdir = inp("WORKING_DIRECTORY", ".") || ".";
  const baseInput = inp("BASE", "");
  const engineInput = inp("ENGINE", "");
  const engineVersion = inp("ENGINE_VERSION", "latest");
  const onForks = inp("ON_FORKS", "dry-run");
  const token = inp("GITHUB_TOKEN", "");
  const includePatterns = splitList(inp("PATHS", ""));
  const ignorePatterns = splitList(inp("PATHS_IGNORE", ""));

  if (!["gates", "all", "never"].includes(failOn)) throw new Error(`bad fail-on: ${failOn}`);
  if (!["both", "summary", "annotations", "none"].includes(commentMode)) throw new Error(`bad comment-mode: ${commentMode}`);

  const event = await loadEvent();
  const pr = event.pull_request;
  const repo = process.env.GITHUB_REPOSITORY || "";
  const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "";
  let number = pr?.number ?? null;
  let base = baseInput || pr?.base?.sha || "";
  let head = pr?.head?.sha || process.env.GITHUB_SHA || "";
  const isFork = !!pr?.head?.repo?.fork && pr?.head?.repo?.full_name !== pr?.base?.repo?.full_name;

  if (!base || !head) {
    errOut("review-error: need a pull_request event or explicit base input");
    await emitOutput("outcome", "error");
    return 2;
  }

  if (isFork && onForks === "skip") {
    out("jev-pref: fork PR, on-forks=skip — nothing to do");
    await emitOutput("outcome", "skipped");
    return 0;
  }
  const forkDryRun = isFork && onForks === "dry-run";

  // Changed files (needs fetch-depth: 0 on checkout) + path filters.
  let files = [];
  try {
    files = (await sh("git", ["diff", "--name-only", `${base}...${head}`, "--", "."], { cwd: workdir }))
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    errOut(`review-error: cannot diff ${base}...${head} (checkout needs fetch-depth: 0): ${e.message}`);
    await emitOutput("outcome", "error");
    return 1;
  }
  const inScope = files.filter(
    (f) => (includePatterns.length === 0 || matchesAny(f, includePatterns)) && !matchesAny(f, ignorePatterns),
  );
  if (inScope.length === 0) {
    out(`jev-pref: no changed files in scope (${files.length} changed) — skipping`);
    await emitOutput("outcome", "skipped");
    return 0;
  }

  // Engine command: explicit path > npx spec. No shell — argv arrays only.
  let cmd;
  let cmdArgs;
  if (engineInput) {
    if (engineInput.endsWith(".js")) {
      cmd = process.execPath;
      cmdArgs = [engineInput];
    } else {
      cmd = "npx";
      cmdArgs = [engineInput];
    }
  } else {
    cmd = "npx";
    cmdArgs = [`jev-pref@${engineVersion}`];
  }

  const engineArgs = [...cmdArgs, "review", "--diff", `${base}...${head}`, "--suites", suites, "--fail-on", "never", "--json"];
  const gateThreshold = inp("GATE_THRESHOLD", "");
  const advisoryThreshold = inp("ADVISORY_THRESHOLD", "");
  if (gateThreshold) engineArgs.push("--gate-threshold", gateThreshold);
  if (advisoryThreshold) engineArgs.push("--advisory-threshold", advisoryThreshold);
  if (configPath) engineArgs.push("--config", configPath);
  if (forkDryRun) engineArgs.push("--dry-run");

  let verdict;
  try {
    const { stdout } = await execFile(cmd, engineArgs, {
      cwd: workdir,
      encoding: "utf8",
      timeout: 600000,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env },
    });
    // Engine --json prints the verdict alone on stdout (diagnostics go to
    // stderr); parse strictly first, fall back to first-{ slicing for older
    // engines whose progress lines share stdout.
    const raw = stdout.trim();
    try {
      verdict = JSON.parse(raw);
    } catch {
      const start = raw.indexOf("{");
      verdict = JSON.parse(raw.slice(start));
    }
  } catch (e) {
    errOut(`review-error: engine failed: ${e.message}`);
    await emitOutput("outcome", "error");
    return 1;
  }
  verdict = normalizeVerdict(verdict);

  if (forkDryRun) {
    out("jev-pref: fork PR without secrets — dry-run shape only (see log)");
    await emitOutput("outcome", "dry-run");
    return 0;
  }

  const outcome = verdict.outcome ?? "error";
  const suiteList = verdict.suites ?? [];
  await emitOutput("outcome", outcome);

  // Sticky comment (needs a token with issues:write; skipped on forks w/o it).
  if ((commentMode === "both" || commentMode === "summary") && number && token && repo) {
    try {
      await upsertComment({
        repo,
        number,
        token,
        body: commentBody({ outcome, suites: suiteList, base: base.slice(0, 7), head: head.slice(0, 7), runUrl }),
      });
    } catch (e) {
      errOut(`review-warning: comment failed (continuing): ${e.message}`);
    }
  }

  // File annotations surface in the PR Files tab + check summary.
  if (commentMode === "both" || commentMode === "annotations") {
    const level = outcome === "fix_now" ? "error" : outcome === "advisory" ? "warning" : "notice";
    if (outcome !== "approve") {
      for (const f of inScope.slice(0, 10)) {
        out(`::${level} file=${f}::jev-pref ${outcome} (see PR comment for details)`);
      }
      if (inScope.length > 10) out(`::${level}::jev-pref ${outcome} on ${inScope.length} files (showing 10)`);
    }
  }

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    await appendFile(summaryFile, `## jev-pref: ${outcome}\n\n${suiteList.map((s) => `- **${s.suite}** — ${s.outcome}`).join("\n")}\n`);
  }

  if (failOn === "never") return 0;
  if (outcome === "fix_now") return 1;
  if (outcome === "advisory" && failOn === "all") return 1;
  if (outcome !== "approve" && outcome !== "advisory") return 1; // error shapes fail loud
  return 0;
}

// Importable for unit tests (node --test); runs only when executed directly.
export { globToRegExp, splitList, matchesAny, commentBody, normalizeVerdict };

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  try {
    process.exitCode = await main();
  } catch (e) {
    errOut(`review-error: ${e?.message ?? String(e)}`);
    try {
      await emitOutput("outcome", "error");
    } catch { /* ignore */ }
    process.exitCode = 2;
  }
}
