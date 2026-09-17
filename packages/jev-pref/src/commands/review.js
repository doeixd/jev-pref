// `jev-pref review` — collect diff, batch all suites into one Jev call,
// judge, print, exit 0/1/2. failOn gates the exit: gates (default) fails
// only on gate violations; all fails on any advisory; never always exits 0
// (verdict still printed).
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { boolFlag, intFlag, strFlag } from "../args.js";
import { resolveApiKey, resolveConfig, validateConfig } from "../config.js";
import { collectState, GitError, UnsafeRefError } from "../git.js";
import { evaluate, JevError, JevOverloadedError } from "../jev.js";
import * as prefsSuite from "../suites/prefs.js";
import * as secretsSuite from "../suites/secrets.js";

const execFile = promisify(execFileCb);

const SUITES = { prefs: prefsSuite, secrets: secretsSuite };

async function prBase(cwd) {
  // `gh pr view` → base ref for --pr without the user knowing git.
  try {
    const { stdout } = await execFile("gh", ["pr", "view", "--json", "baseRefName", "-q", ".baseRefName"], {
      cwd,
      encoding: "utf8",
      timeout: 15000,
    });
    const base = stdout.trim();
    return base ? `origin/${base}...HEAD` : null;
  } catch {
    return null;
  }
}

function renderVerdict(suiteVerdicts) {
  const worst = suiteVerdicts.some((v) => v.outcome === "fix_now")
    ? "fix_now"
    : suiteVerdicts.some((v) => v.outcome === "advisory")
    ? "advisory"
    : "approve";
  const lines = [];
  for (const v of suiteVerdicts) {
    for (const f of [...v.failures, ...v.notes]) lines.push(`- [${v.suite}] ${f}`);
  }
  const head = `${worst} (suites: ${suiteVerdicts.map((v) => `${v.suite}=${v.outcome}`).join(", ")})`;
  if (worst === "approve") return { worst, text: head };
  return { worst, text: lines.length > 0 ? `${head}\n${lines.join("\n")}` : `${head}\n- minor notes` };
}

export async function review(argv, { cwd = ".", out = console } = {}) {
  const { flags } = argv;
  const diffFlag = strFlag(flags, "diff");
  const usePr = boolFlag(flags, "pr");
  const staged = boolFlag(flags, "staged");
  const dryRun = boolFlag(flags, "dry-run") || boolFlag(flags, "n");
  const json = boolFlag(flags, "json");

  let { config } = await resolveConfig({ rootDir: cwd, flags: {} });
  // Flags override files (precedence); map kebab-case to config keys.
  const flagOverrides = {};
  const suitesFlag = strFlag(flags, "suites");
  if (suitesFlag !== undefined) flagOverrides.suites = suitesFlag.split(",").map((s) => s.trim()).filter(Boolean);
  for (const [flag, key, parse] of [
    ["gate-threshold", "gateThreshold", Number],
    ["advisory-threshold", "advisoryThreshold", Number],
    ["severity-fail", "severityFail", Number],
    ["fail-on", "failOn", String],
    ["timeout-ms", "timeoutMs", Number],
    ["max-diff-chars", "maxDiffChars", Number],
    ["model", "model", String],
    ["base-url", "baseUrl", String],
    ["provider", "provider", String],
  ]) {
    const raw = strFlag(flags, flag);
    if (raw !== undefined) flagOverrides[key] = parse(raw);
  }
  if (strFlag(flags, "config") !== undefined) {
    ({ config } = await resolveConfig({ rootDir: cwd, flags: { config: strFlag(flags, "config") } }));
  }
  config = { ...config, ...flagOverrides };
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    out.error(`review-error: invalid config: ${configErrors.join("; ")}`);
    return 2;
  }

  let ref = diffFlag ?? null;
  if (usePr) {
    const base = await prBase(cwd);
    if (!base) {
      out.error("review-error: --pr needs an open PR (gh pr view found none)");
      return 2;
    }
    ref = base;
  }

  let gs;
  try {
    gs = await collectState({ cwd, ref, staged, maxDiffChars: config.maxDiffChars });
  } catch (e) {
    if (e instanceof UnsafeRefError || e instanceof GitError) {
      out.error(`review-error: ${e.message}`);
      return 2;
    }
    throw e;
  }
  if (gs.diff.trim() === "" && gs.untracked === "") {
    out.log("approve: no changes detected.");
    return 0;
  }

  const unknownSuites = config.suites.filter((s) => !SUITES[s]);
  if (unknownSuites.length > 0) {
    out.error(`review-error: unknown suites: ${unknownSuites.join(", ")} (known: ${Object.keys(SUITES).join(", ")})`);
    return 2;
  }

  const state = {
    prefs: config.prefs.map((p) => `${p.id} [${p.gate ? "gate" : "advisory"}]: ${p.text}`),
    diff: gs.diff,
    untracked_files: gs.untracked === "" ? "(none)" : gs.untracked,
    git_status: gs.status === "" ? "(clean)" : gs.status,
    diff_stat: gs.stat === "" ? "(empty)" : gs.stat,
    context: `branch ${gs.branch}, scope ${gs.scope}`,
    note: gs.truncated
      ? `diff truncated to ${config.maxDiffChars} chars; review covers the leading portion only.`
      : "full diff included.",
  };

  const questions = {};
  for (const suiteId of config.suites) {
    const suite = SUITES[suiteId];
    Object.assign(questions, suiteId === "prefs" ? suite.buildQuestions(config.prefs) : suite.buildQuestions());
  }

  if (dryRun) {
    out.log(JSON.stringify({
      mode: "dry-run",
      suites: config.suites,
      state: { ...state, diff: state.diff.slice(0, 2000) + (state.diff.length > 2000 ? "…(truncated preview)" : "") },
      questions,
    }, null, 2));
    return 0;
  }

  if (config.suites.includes("prefs") && config.prefs.length === 0) {
    out.error("review-error: prefs suite enabled but no prefs configured (add prefs or drop the suite)");
    return 2;
  }

  let answers;
  try {
    answers = await evaluate({
      state,
      questions,
      client: {
        apiKey: resolveApiKey(flags),
        baseURL: config.baseUrl,
        model: config.model,
        provider: config.provider,
        zeroDataRetention: config.zeroDataRetention,
      },
      timeoutMs: intFlag(flags, "timeout-ms", { def: config.timeoutMs }),
    });
  } catch (e) {
    if (e instanceof JevError || e instanceof JevOverloadedError) {
      out.error(`review-error: ${e.message}`);
      return 2;
    }
    throw e;
  }

  const suiteVerdicts = config.suites.map((suiteId) => {
    const suite = SUITES[suiteId];
    const v = suiteId === "prefs"
      ? suite.judge(config.prefs, answers, config)
      : suite.judge(answers, config);
    return { suite: suiteId, ...v };
  });
  const { worst, text } = renderVerdict(suiteVerdicts);
  out.log(json ? JSON.stringify({ outcome: worst, suites: suiteVerdicts }) : text);

  if (config.failOn === "never") return 0;
  if (worst === "fix_now") return 1;
  if (worst === "advisory" && config.failOn === "all") return 1;
  return 0;
}
