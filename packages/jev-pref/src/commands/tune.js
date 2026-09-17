// `jev-pref tune` — v1: run evals/ labeled cases at the configured thresholds
// and report per-pref accuracy; --sweep tries thresholds {0.5..0.9} and
// proposes the best per-pref values as a config diff (asks nothing — the
// agent/user applies it). Needs a live key (like review); --dry-run prints
// what would run.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { boolFlag, strFlag } from "../args.js";
import { resolveConfig, validateConfig } from "../config.js";
import { evaluate } from "../jev.js";
import { buildQuestions } from "../suites/prefs.js";

const SWEEP = [0.5, 0.6, 0.7, 0.8, 0.9];

async function loadEvals(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      out.push({ file: f, ...JSON.parse(await readFile(join(dir, f), "utf8")) });
    } catch {
      // Skip unreadable eval files; report below.
      out.push({ file: f, error: "unreadable" });
    }
  }
  return out;
}

export async function tune(argv, { cwd = ".", out = console } = {}) {
  const { flags } = argv;
  const dryRun = boolFlag(flags, "dry-run");
  const sweep = boolFlag(flags, "sweep");
  const evalsDir = strFlag(flags, "evals-dir") ?? join(cwd, "evals");

  const { config } = await resolveConfig({ rootDir: cwd, flags: {} });
  const errors = validateConfig(config);
  if (errors.length > 0) {
    out.error(`review-error: invalid config: ${errors.join("; ")}`);
    return 2;
  }
  const evals = await loadEvals(evalsDir);
  if (evals.length === 0) {
    out.error(`review-error: no evals in ${evalsDir} (add {name, diff, expected} JSON files)`);
    return 2;
  }

  // expected: { [prefId]: true(violation)|false } — accuracy = P>=t matches expected.
  const cases = evals.filter((e) => !e.error && typeof e.diff === "string" && e.expected && typeof e.expected === "object");
  for (const e of evals) {
    if (e.error || typeof e.diff !== "string" || !e.expected) {
      out.log(`skip ${e.file}: needs {name, diff, expected} (${e.error ?? "bad shape"})`);
    }
  }
  if (cases.length === 0) {
    out.error("review-error: no runnable eval cases");
    return 2;
  }
  if (dryRun) {
    out.log(JSON.stringify({ mode: "dry-run", cases: cases.map((c) => c.file ?? c.name), thresholds: SWEEP }, null, 2));
    return 0;
  }

  const questions = buildQuestions(config.prefs);
  const state = (c) => ({ prefs: config.prefs.map((p) => `${p.id}: ${p.text}`), diff: c.diff });
  const probs = {}; // file -> { prefId -> P }
  for (const c of cases) {
    let answers;
    try {
      answers = await evaluate({ state: state(c), questions, client: {}, timeoutMs: config.timeoutMs });
    } catch (e) {
      out.error(`review-error: eval ${c.file}: ${e.message}`);
      return 2;
    }
    probs[c.file] = Object.fromEntries(
      config.prefs.map((p) => [p.id, answers[`pref_${p.id}`]?.chance ?? 0]),
    );
  }

  const accuracy = (threshold) => {
    let hit = 0;
    let total = 0;
    for (const c of cases) {
      for (const p of config.prefs) {
        const expected = c.expected[p.id];
        if (expected === undefined) continue;
        total++;
        if ((probs[c.file][p.id] >= threshold) === !!expected) hit++;
      }
    }
    return total === 0 ? null : hit / total;
  };

  const current = accuracy(config.gateThreshold);
  out.log(`accuracy @ gateThreshold=${config.gateThreshold}: ${current === null ? "n/a (no labeled prefs)" : `${(current * 100).toFixed(1)}% over ${cases.length} cases`}`);
  if (!sweep) return 0;

  let best = { t: config.gateThreshold, acc: current ?? -1 };
  for (const t of SWEEP) {
    const acc = accuracy(t) ?? -1;
    out.log(`  threshold ${t}: ${acc < 0 ? "n/a" : `${(acc * 100).toFixed(1)}%`}`);
    if (acc > best.acc) best = { t, acc };
  }
  if (best.t !== config.gateThreshold) {
    out.log(`proposed config diff: gateThreshold ${config.gateThreshold} -> ${best.t} (apply with your editor; re-run tune to confirm)`);
  } else {
    out.log("current gateThreshold already optimal on these evals");
  }
  return 0;
}
