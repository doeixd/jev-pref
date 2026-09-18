// `jev-pref review` — collect diff, judge whole-diff or per-hunk, optionally
// hand the verdict to a user-selected agent command. Exit contract 0/1/2;
// failOn gates the exit: gates (default) fails only on gate violations, all
// fails on any advisory, never always exits 0 (verdict still printed).
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { boolFlag, intFlag, InvalidArgs, listFlag, numFlag, strFlag } from "../args.js";
import { runAgent, AgentError } from "../agent.js";
import { JEV_INPUT_TOKEN_LIMIT, SAFE_SERIALIZED_INPUT_CHARS, serializedInputChars } from "../budget.js";
import { resolveApiKey, resolveConfig, validateConfig } from "../config.js";
import { collectState, GitError, UnsafeRefError } from "../git.js";
import { hunkLabel, splitFiles, splitHunks } from "../hunks.js";
import * as prefsSuite from "../suites/prefs.js";
import * as secretsSuite from "../suites/secrets.js";

const execFile = promisify(execFileCb);

export const SUITES = { prefs: prefsSuite, secrets: secretsSuite };

async function prBase(cwd) {
  // `gh pr view` → base ref for --pr without the user knowing git.
  // Prefer origin/<base> when fetched; fall back to the bare branch name.
  let base;
  try {
    const { stdout } = await execFile("gh", ["pr", "view", "--json", "baseRefName", "-q", ".baseRefName"], {
      cwd,
      encoding: "utf8",
      timeout: 15000,
    });
    base = stdout.trim();
  } catch (e) {
    if (e?.code === "ENOENT") throw new GitError("gh", "review --pr needs the gh CLI (not found on PATH)");
    throw new GitError("gh pr view", "review --pr needs an open PR (gh pr view found none)");
  }
  if (!base) throw new GitError("gh pr view", "review --pr needs an open PR (gh pr view found none)");
  try {
    await execFile("git", ["rev-parse", "--verify", `origin/${base}`], { cwd, encoding: "utf8", timeout: 15000 });
    return `origin/${base}...HEAD`;
  } catch {
    return `${base}...HEAD`;
  }
}

/** Read a piped diff for `--diff -`. Null = usage error (already reported). */
async function readStdinDiff(out, { stdin = process.stdin } = {}) {
  if (stdin.isTTY) {
    out.error("review-error: --diff - needs piped input (stdin is a terminal)");
    return null;
  }
  const chunks = [];
  let bytes = 0;
  const CAP = 10 * 1024 * 1024;
  for await (const chunk of stdin) {
    chunks.push(chunk);
    bytes += chunk.length;
    if (bytes > CAP) {
      out.error("review-error: piped diff exceeds the 10 MiB input limit; narrow it before review");
      return null;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

function suiteQuestions(config) {
  const questions = {};
  for (const suiteId of config.suites) {
    const suite = SUITES[suiteId];
    Object.assign(questions, suiteId === "prefs" ? suite.buildQuestions(config.prefs) : suite.buildQuestions());
  }
  return questions;
}

function judgeSuites(config, answers) {  return config.suites.map((suiteId) => {
    const suite = SUITES[suiteId];
    const v = suiteId === "prefs"
      ? suite.judge(config.prefs, answers, config)
      : suite.judge(answers, config);
    return { suite: suiteId, ...v };
  });
}

function worstOf(verdicts) {
  if (verdicts.some((v) => v.outcome === "fix_now")) return "fix_now";
  if (verdicts.some((v) => v.outcome === "advisory")) return "advisory";
  return "approve";
}

// Exported for unit tests (pure rendering, no IO).
export function renderVerdict(suiteVerdicts, scope = "") {
  const worst = worstOf(suiteVerdicts);
  const tag = scope ? `[${scope}] ` : "";
  const lines = [];
  for (const v of suiteVerdicts) {
    for (const c of v.classifications ?? []) {
      if (!c.label) continue;
      const confidence = c.confidence === undefined ? "" : ` confidence=${c.confidence.toFixed(2)}`;
      lines.push(`- ${tag}[${v.suite}] ${c.id}=${c.label} P=${c.probability.toFixed(2)}${confidence} -> ${c.outcome}`);
    }
    for (const f of [...v.failures, ...v.notes]) lines.push(`- ${tag}[${v.suite}] ${f}`);
  }
  const head = `${tag}${worst} (suites: ${suiteVerdicts.map((v) => `${v.suite}=${v.outcome}`).join(", ")})`;
  if (worst === "approve") return lines.length > 0 ? `${head}\n${lines.join("\n")}` : head;
  return lines.length > 0 ? `${head}\n${lines.join("\n")}` : `${head}\n- minor notes`;
}

function resolveAgent(flags, config) {
  // Flags override config. Flag/env form is a plain string (whitespace
  // split — use the config array form for quoted args).
  const cmdFlag = strFlag(flags, "agent-cmd") ?? process.env.JEV_AGENT_CMD;
  if (cmdFlag !== undefined) {
    const command = cmdFlag.split(/\s+/).filter(Boolean);
    if (command.length === 0) throw new InvalidArgs("--agent-cmd must not be empty");
    const input = strFlag(flags, "agent-input") ?? process.env.JEV_AGENT_INPUT ?? "json";
    if (!["json", "text", "none"].includes(input)) {
      throw new InvalidArgs(`--agent-input must be json|text|none, got ${JSON.stringify(input)}`);
    }
    const onEnv = process.env.JEV_AGENT_ON;
    const on = listFlag(flags, "agent-on")
      ?? (onEnv !== undefined ? onEnv.split(",").map((s) => s.trim()).filter(Boolean) : ["fix_now"]);
    if (on.length === 0 || on.some((o) => !["fix_now", "advisory", "approve"].includes(o))) {
      throw new InvalidArgs("--agent-on must be a non-empty csv of fix_now|advisory|approve");
    }
    const envTimeout = process.env.JEV_AGENT_TIMEOUT_MS;
    let envTimeoutMs = config.agent?.timeoutMs ?? 300000;
    if (envTimeout !== undefined && envTimeout !== "") {
      envTimeoutMs = Number(envTimeout);
      if (!Number.isInteger(envTimeoutMs) || envTimeoutMs <= 0) {
        throw new InvalidArgs(`JEV_AGENT_TIMEOUT_MS must be a positive integer, got ${JSON.stringify(envTimeout)}`);
      }
    }
    return {
      command,
      input,
      on,
      timeoutMs: intFlag(flags, "agent-timeout-ms", { def: envTimeoutMs }),
    };
  }
  if (!config.agent) return null;
  return {
    command: config.agent.command,
    input: config.agent.input ?? "json",
    on: config.agent.on ?? ["fix_now"],
    timeoutMs: config.agent.timeoutMs ?? 300000,
  };
}

export async function review(argv, { cwd = ".", out = console } = {}) {
  const { flags } = argv;
  const diffFlag = strFlag(flags, "diff");
  const usePr = boolFlag(flags, "pr");
  const staged = boolFlag(flags, "staged");
  const dryRun = boolFlag(flags, "dry-run") || boolFlag(flags, "n");
  const json = boolFlag(flags, "json");
  // In --json mode stdout must stay machine-parseable: diagnostics go to
  // stderr, the verdict alone goes to stdout.
  const diag = json ? { log: (m) => out.error(m), error: (m) => out.error(m) } : out;

  const modes = [diffFlag !== undefined ? "--diff" : null, usePr ? "--pr" : null, staged ? "--staged" : null]
    .filter(Boolean);
  if (modes.length > 1) {
    out.error(`review-error: ${modes.join(" and ")} are mutually exclusive (pick one scope)`);
    return 2;
  }

  const hunksFlag = boolFlag(flags, "hunks");
  const noHunksFlag = boolFlag(flags, "no-hunks");
  const filesFlag = boolFlag(flags, "files");
  const noFilesFlag = boolFlag(flags, "no-files");
  if (hunksFlag && noHunksFlag) {
    out.error("review-error: --hunks and --no-hunks are mutually exclusive");
    return 2;
  }
  if (filesFlag && noFilesFlag) {
    out.error("review-error: --files and --no-files are mutually exclusive");
    return 2;
  }
  if (hunksFlag && filesFlag) {
    out.error("review-error: --hunks and --files are mutually exclusive");
    return 2;
  }

  // One resolution pass: defaults < fenced < project < local < env < flags.
  const configFlag = strFlag(flags, "config");
  const overrides = {};
  for (const [flag, key] of [["suites", "suites"], ["include", "include"], ["exclude", "exclude"]]) {
    const list = listFlag(flags, flag);
    if (list !== undefined) overrides[key] = list;
  }
  for (const [flag, key] of [
    ["gate-threshold", "gateThreshold"],
    ["advisory-threshold", "advisoryThreshold"],
  ]) {
    const v = strFlag(flags, flag);
    if (v !== undefined) overrides[key] = numFlag(flags, flag, { min: 0, max: 1 });
  }
  for (const [flag, key] of [
    ["timeout-ms", "timeoutMs"],
    ["max-diff-chars", "maxDiffChars"],
    ["max-hunks", "maxHunks"],
  ]) {
    if (strFlag(flags, flag) !== undefined) overrides[key] = intFlag(flags, flag, { def: 0 });
  }
  for (const [flag, key] of [["model", "model"], ["base-url", "baseUrl"], ["provider", "provider"]]) {
    const v = strFlag(flags, flag);
    if (v !== undefined) overrides[key] = v;
  }
  const failOn = strFlag(flags, "fail-on");
  if (failOn !== undefined) overrides.failOn = failOn;
  if (hunksFlag) {
    overrides.hunks = true;
    overrides.files = false;
  }
  if (noHunksFlag) overrides.hunks = false;
  if (filesFlag) {
    overrides.files = true;
    overrides.hunks = false;
  }
  if (noFilesFlag) overrides.files = false;

  let config;
  try {
    ({ config } = await resolveConfig({
      rootDir: cwd,
      flags: { ...(configFlag !== undefined ? { config: configFlag } : {}), ...overrides },
    }));
  } catch (e) {
    out.error(`review-error: ${e?.message ?? String(e)}`);
    return 2;
  }
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    out.error(`review-error: invalid config: ${configErrors.join("; ")}`);
    return 2;
  }

  const unknownSuites = config.suites.filter((s) => !SUITES[s]);
  if (unknownSuites.length > 0) {
    out.error(`review-error: unknown suites: ${unknownSuites.join(", ")} (known: ${Object.keys(SUITES).join(", ")})`);
    return 2;
  }
  if (config.suites.includes("prefs") && config.prefs.length === 0) {
    out.error("review-error: prefs suite enabled but no prefs configured (add prefs or drop the suite)");
    return 2;
  }

  let ref = diffFlag && diffFlag !== "-" ? diffFlag : null;
  let stdinDiff = null;
  if (diffFlag === "-") {
    // Piped diff: no repo needed, no git invoked. Pre-filter upstream
    // (git diff -- src/ | jev-pref review --diff -); --include/--exclude
    // apply to git scopes only.
    stdinDiff = await readStdinDiff(out);
    if (stdinDiff === null) return 2;
  }
  if (usePr) {
    try {
      ref = await prBase(cwd);
    } catch (e) {
      if (e instanceof GitError) {
        out.error(`review-error: ${e.message}`);
        return 2;
      }
      throw e;
    }
  }

  let gs;
  try {
    gs = await collectState({
      cwd,
      ref,
      staged,
      maxDiffChars: config.maxDiffChars,
      include: config.include,
      exclude: config.exclude,
      diffText: stdinDiff,
      truncate: !(config.hunks || config.files),
    });
  } catch (e) {
    if (e instanceof UnsafeRefError || e instanceof GitError) {
      out.error(`review-error: ${e.message}`);
      return 2;
    }
    throw e;
  }
  if (gs.diff.trim() === "" && gs.untracked === "") {
    if (json) out.log(JSON.stringify({ outcome: "approve", detail: "no changes detected", files: [] }));
    else out.log("approve: no changes detected.");
    return 0;
  }
  if (gs.incompleteReasons?.length > 0) {
    out.error(
      `review-error: review input is incomplete: ${gs.incompleteReasons.join("; ")}. ` +
      "Review a smaller change or narrow scope with --include/--exclude; incomplete input is not approval.",
    );
    return 2;
  }
  if (gs.truncated) {
    out.error(
      `review-error: diff exceeds the ${config.maxDiffChars}-character per-request budget. ` +
      "Review a smaller change, use --files/--hunks, or narrow scope with --include/--exclude. " +
      "Jev has a 30k-token total input limit; partial diffs are not treated as approval.",
    );
    return 2;
  }

  const baseState = {
    prefs: config.prefs.map(prefsSuite.describePreference),
    untracked_files: gs.untracked === "" ? "(none)" : gs.untracked,
    git_status: gs.status === "" ? "(clean)" : gs.status,
    diff_stat: gs.stat === "" ? "(empty)" : gs.stat,
    context: `branch ${gs.branch}, scope ${gs.scope}`,
  };
  const note = "complete review scope included; requests stay below the configured per-request diff budget.";

  const client = {
    apiKey: resolveApiKey(),
    baseURL: config.baseUrl,
    model: config.model,
    provider: config.provider,
    zeroDataRetention: config.zeroDataRetention,
  };
  const timeoutMs = config.timeoutMs;

  // Scopes to judge: per-hunk, per-file, or one whole diff. Scoped modes
  // collect the full diff and split oversized scopes into bounded parts.
  const hunksMode = config.hunks;
  const filesMode = config.files;
  const scopedMode = hunksMode || filesMode;
  const scopeKind = hunksMode ? "hunks" : filesMode ? "files" : "whole-diff";
  let scopes;
  if (scopedMode) {
    const trackedDiff = gs.trackedDiff ?? gs.diff;
    const tracked = hunksMode ? splitHunks(trackedDiff) : splitFiles(trackedDiff);
    // Untracked files are not in `git diff` — each becomes its own scope.
    const newFileScopes = (gs.untrackedSections ?? []).map((s) => {
      const lines = s.text.split("\n").length;
      return {
        label: `${s.file}:1-${lines}`,
        file: s.file,
        start: 1,
        count: lines,
        state: { ...baseState, new_file: s.file, diff: s.text, note },
        files: [s.file],
      };
    });
    const trackedScopes = tracked.map((item) => {
      const label = hunksMode ? hunkLabel(item) : item.file;
      return {
        label,
        file: item.file,
        start: item.start,
        count: item.count,
        state: {
          ...baseState,
          ...(hunksMode ? { hunk: { file: item.file, label, header: item.header } } : { changed_file: item.file }),
          diff: item.body,
          note,
        },
        files: [item.file],
      };
    });
    const all = [...trackedScopes, ...newFileScopes].flatMap((scope) => {
      if (scope.state.diff.length <= config.maxDiffChars) return [scope];
      const parts = [];
      for (let offset = 0; offset < scope.state.diff.length; offset += config.maxDiffChars) {
        parts.push(scope.state.diff.slice(offset, offset + config.maxDiffChars));
      }
      return parts.map((part, index) => ({
        ...scope,
        label: `${scope.label} (part ${index + 1}/${parts.length})`,
        state: {
          ...scope.state,
          diff: part,
          note: `${note} Split from an oversized ${hunksMode ? "hunk" : "file"}.`,
        },
      }));
    });
    if (all.length === 0) {
      const parts = [];
      for (let offset = 0; offset < gs.diff.length; offset += config.maxDiffChars) {
        parts.push(gs.diff.slice(offset, offset + config.maxDiffChars));
      }
      scopes = parts.map((part, index) => ({
        label: parts.length === 1 ? "input" : `input (part ${index + 1}/${parts.length})`,
        state: { ...baseState, diff: part, note: `${note} Input was not a parseable unified diff.` },
        files: [],
      }));
    } else {
      scopes = all;
    }
  } else {
    scopes = [{ label: "", state: { ...baseState, diff: gs.diff, note }, files: [] }];
  }

  if (scopes.length > config.maxHunks) {
    out.error(
      `review-error: ${scopes.length} ${scopeKind} scopes exceed max-hunks=${config.maxHunks}. ` +
      "Review a smaller change, narrow it with --include/--exclude, or intentionally raise --max-hunks. " +
      "jev-pref will not collapse scoped review into an oversized whole-diff request.",
    );
    return 2;
  }

  const questions = suiteQuestions(config);
  for (const scope of scopes) {
    const inputChars = serializedInputChars(scope.state, questions);
    if (inputChars > SAFE_SERIALIZED_INPUT_CHARS) {
      out.error(
        `review-error: planned Jev input is ${inputChars} characters before tokenization. ` +
        `Jev accepts at most ${JEV_INPUT_TOKEN_LIMIT} input tokens; reduce maxDiffChars, preferences, or review scope.`,
      );
      return 2;
    }
  }
  if (dryRun) {
    const preview = scopedMode
      ? {
        mode: "dry-run",
        granularity: scopeKind,
        suites: config.suites,
        scopes: scopes.map((s) => ({ label: s.label || "(whole-diff)", file: s.file, state: { ...s.state, diff: s.state.diff.slice(0, 500) } })),
        questions,
        note: `Jev input limit: 30k tokens; diff budget per request: ${config.maxDiffChars} characters.`,
      }
      : {
        mode: "dry-run",
        granularity: "whole-diff",
        suites: config.suites,
        state: { ...scopes[0].state, diff: scopes[0].state.diff.slice(0, 2000) },
        questions,
      };
    out.log(JSON.stringify(preview, null, 2));
    return 0;
  }

  // One Jev call per scope, sequential (rate-limit friendly). The client
  // loads lazily so --dry-run works with zero dependencies installed.
  const { evaluate, JevError, JevOverloadedError } = await import("../jev.js");
  const scopeResults = [];
  try {
    for (const scope of scopes) {
      const answers = await evaluate({ state: scope.state, questions, client, timeoutMs });
      const suiteVerdicts = judgeSuites(config, answers);
      scopeResults.push({ ...scope, state: undefined, suiteVerdicts, outcome: worstOf(suiteVerdicts) });
    }
  } catch (e) {
    if (e instanceof JevError || e instanceof JevOverloadedError) {
      const hint = /max[_ -]?tokens|token limit/i.test(e.message)
        ? " Use --files/--hunks or narrow the review with --include/--exclude. Jev accepts at most 30k input tokens."
        : "";
      out.error(`review-error: ${e.message}${hint}`);
      return 2;
    }
    throw e;
  }

  const allVerdicts = scopeResults.flatMap((s) => s.suiteVerdicts);
  const overall = worstOf(allVerdicts);
  let text;
  let payload;
  if (scopeResults.length === 1 && !scopeResults[0].label) {
    text = renderVerdict(scopeResults[0].suiteVerdicts);
    payload = { outcome: overall, suites: scopeResults[0].suiteVerdicts, files: [] };
  } else {
    const blocks = scopeResults.map((s) => renderVerdict(s.suiteVerdicts, s.label));
    text = `${overall} (${scopeResults.length} ${scopeKind} scopes)\n${blocks.join("\n")}`;
    payload = {
      outcome: overall,
      scopes: scopeResults.map((s) => ({ label: s.label, file: s.file, start: s.start, count: s.count, outcome: s.outcome, suites: s.suiteVerdicts })),
      ...(hunksMode ? { hunks: scopeResults.map((s) => ({ label: s.label, file: s.file, start: s.start, count: s.count, outcome: s.outcome, suites: s.suiteVerdicts })) } : {}),
      files: [...new Set(scopeResults.flatMap((s) => s.files))],
    };
  }
  out.log(json ? JSON.stringify(payload) : text);

  // Agent handoff: pipe the verdict to the user's command (argv only, no shell).
  const agent = resolveAgent(flags, config);
  if (agent && agent.on.includes(overall)) {
    try {
      await runAgent({
        command: agent.command,
        input: agent.input,
        payload: { ...payload, text, diff: gs.diff.slice(0, config.maxDiffChars), files: payload.files },
        timeoutMs: agent.timeoutMs,
        out: diag,
      });
    } catch (e) {
      if (e instanceof AgentError) {
        out.error(`agent-error: ${e.message}`);
        return 2;
      }
      throw e;
    }
  }

  if (config.failOn === "never") return 0;
  if (overall === "fix_now") return 1;
  if (overall === "advisory" && config.failOn === "all") return 1;
  return 0;
}
