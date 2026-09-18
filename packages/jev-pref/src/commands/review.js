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

function suiteQuestions(config, prefs = config.prefs) {
  const questions = {};
  for (const suiteId of config.suites) {
    const suite = SUITES[suiteId];
    Object.assign(questions, suiteId === "prefs" ? suite.buildQuestions(prefs) : suite.buildQuestions());
  }
  return questions;
}

function judgeSuites(config, answers, prefs = config.prefs) {  return config.suites.map((suiteId) => {
    const suite = SUITES[suiteId];
    const v = suiteId === "prefs"
      ? suite.judge(prefs, answers, config)
      : suite.judge(answers, config);
    return { suite: suiteId, ...v };
  });
}

/** Observation form: raw per-pref records with policy context, no verdict. */
function rawSuites(config, answers, prefs = config.prefs) {
  const out = [];
  for (const suiteId of config.suites) {
    if (suiteId === "prefs") {
      for (const r of prefsSuite.rawResults(prefs, answers, config)) out.push({ ...r, suite: "prefs" });
    } else {
      for (const r of SUITES[suiteId].rawResults?.(answers, config) ?? []) out.push({ ...r, suite: suiteId });
    }
  }
  return out;
}

export const RAW_INTRO = "raw probabilities — no verdict applied. P estimates how likely the condition holds (conditions) or the selected label is right (choices). Confidence is strength of belief and never decides anything. Each line shows its cutoff (your gate/advisory threshold); compare P against it yourself.";

// Exported for unit tests (pure rendering, no IO).
export function renderRaw(rawScopes, { gateThreshold, advisoryThreshold }) {
  const lines = [
    RAW_INTRO,
    `cutoffs: gate=${Number(gateThreshold).toFixed(2)}, advisory=${Number(advisoryThreshold).toFixed(2)}`,
    "",
  ];
  for (const s of rawScopes ?? []) {
    const tag = s.label ? `[${s.label}] ` : "";
    for (const r of s.results ?? []) {
      const who = r.name ? `${r.name} (${r.id})` : r.id;
      const confidence = r.confidence === undefined ? "" : ` confidence=${r.confidence.toFixed(2)}`;
      const what = r.kind === "choice"
        ? `${who}=${r.label ?? "(no label)"} P=${r.probability.toFixed(2)}${confidence} cutoff=${r.cutoff.toFixed(2)} outcomes=${Object.entries(r.outcomes ?? {}).map(([l, o]) => `${l}->${o}`).join(", ")}`
        : `${who} P=${r.probability.toFixed(2)} cutoff=${r.cutoff.toFixed(2)} ${r.gate ? "gate" : "advisory"}`;
      lines.push(`- ${tag}${what} — ${r.question}`);
    }
  }
  return lines.join("\n");
}

/** Presentable question map: Jev wire type "noul" is a condition. */
export function displayQuestions(questions) {
  const out = {};
  for (const [key, q] of Object.entries(questions ?? {})) {
    out[key] = { ...q, type: q?.type === "noul" ? "condition" : q?.type };
  }
  return out;
}

export function countAdvisories(suiteVerdicts) {
  let n = 0;
  for (const v of suiteVerdicts ?? []) {
    n += (v.notes ?? []).length;
    for (const c of v.classifications ?? []) {
      // Count only printed sub-threshold signals: labeled (choice) advisory
      // classifications in an approving suite. Unlabeled condition entries
      // always carry their gate/advisory mapping even at P=0, so counting them
      // would report advisories that never fired.
      if (!c.label || c.outcome !== "advisory") continue;
      if ((v.outcome ?? "approve") !== "approve") continue;
      // Notes headline named prefs as "Name (id)=label"; match loosely so a
      // reported classification is never double-counted.
      if ((v.notes ?? []).some((note) => String(note).includes(c.id) && String(note).includes(`=${c.label}`))) continue;
      n += 1;
    }
  }
  return n;
}

function worstOf(verdicts) {
  if (verdicts.some((v) => v.outcome === "fix_now")) return "fix_now";
  if (verdicts.some((v) => v.outcome === "advisory")) return "advisory";
  return "approve";
}

// Exported for unit tests (pure rendering, no IO).
// Confidence is informational only: thresholds gate on probability (P).
// Advisory-only passes stay distinct from clean approvals so the exit-code
// contract (0 for advisory when failOn=gates) is not misread as clean.
export function renderVerdict(suiteVerdicts, scope = "") {
  const worst = worstOf(suiteVerdicts);
  const tag = scope ? `[${scope}] ` : "";
  const lines = [];
  for (const v of suiteVerdicts) {
    for (const c of v.classifications ?? []) {
      if (!c.label) continue;
      const confidence = c.confidence === undefined ? "" : ` confidence=${c.confidence.toFixed(2)}`;
      const who = typeof c.name === "string" && c.name.length > 0 ? `${c.name} (${c.id})` : c.id;
      lines.push(`- ${tag}[${v.suite}] ${who}=${c.label} P=${c.probability.toFixed(2)}${confidence} -> ${c.outcome}`);
    }
    for (const f of [...v.failures, ...v.notes]) lines.push(`- ${tag}[${v.suite}] ${f}`);
  }
  const advisoryCount = countAdvisories(suiteVerdicts);
  const suiteSummary = suiteVerdicts.map((v) => `${v.suite}=${v.outcome}`).join(", ");
  if (worst === "advisory") {
    const head = `${tag}advisory (${advisoryCount} ${advisoryCount === 1 ? "advisory" : "advisories"}, suites: ${suiteSummary})`;
    return lines.length > 0 ? `${head}\n${lines.join("\n")}` : `${head}\n- minor notes`;
  }
  if (worst === "approve") {
    const head = advisoryCount > 0
      ? `${tag}approve with ${advisoryCount} ${advisoryCount === 1 ? "advisory" : "advisories"} (suites: ${suiteSummary})`
      : `${tag}approve (suites: ${suiteSummary})`;
    return lines.length > 0 ? `${head}\n${lines.join("\n")}` : head;
  }
  const head = `${tag}${worst} (suites: ${suiteSummary})`;
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
  const rawFlag = boolFlag(flags, "raw");
  const noRawFlag = boolFlag(flags, "no-raw");
  if (hunksFlag && noHunksFlag) {
    out.error("review-error: --hunks and --no-hunks are mutually exclusive");
    return 2;
  }
  if (filesFlag && noFilesFlag) {
    out.error("review-error: --files and --no-files are mutually exclusive");
    return 2;
  }
  if (rawFlag && noRawFlag) {
    out.error("review-error: --raw and --no-raw are mutually exclusive");
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
  if (rawFlag) overrides.raw = true;
  if (noRawFlag) overrides.raw = false;

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

  const { hunkPrefs, changePrefs } = prefsSuite.partitionPrefs(config.prefs);
  const hunkStatePrefs = hunkPrefs.map(prefsSuite.describePreference);
  const changeStatePrefs = changePrefs.map(prefsSuite.describePreference);
  const baseCommon = {
    untracked_files: gs.untracked === "" ? "(none)" : gs.untracked,
    git_status: gs.status === "" ? "(clean)" : gs.status,
    diff_stat: gs.stat === "" ? "(empty)" : gs.stat,
    context: `branch ${gs.branch}, scope ${gs.scope}`,
  };
  const baseState = {
    prefs: config.prefs.map(prefsSuite.describePreference),
    ...baseCommon,
  };
  const note = "complete review scope included; requests stay below the configured per-request diff budget.";
  const changeNote = `${note} Change-scoped preferences evaluate once against the whole diff.`;
  const questionsHunk = suiteQuestions(config, hunkPrefs);
  const questionsChange = changePrefs.length > 0 && config.suites.includes("prefs")
    ? prefsSuite.buildQuestions(changePrefs)
    : {};
  const questions = suiteQuestions(config);

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
  let changeState = null;
  if (scopedMode) {
    const hunkBase = { ...baseCommon, prefs: hunkStatePrefs };
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
        state: { ...hunkBase, new_file: s.file, diff: s.text, note },
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
          ...hunkBase,
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
        state: { ...hunkBase, diff: part, note: `${note} Input was not a parseable unified diff.` },
        files: [],
      }));
    } else {
      scopes = all;
    }
    if (changePrefs.length > 0) {
      changeState = { ...baseCommon, prefs: changeStatePrefs, diff: gs.diff, note: changeNote };
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

  // Budget checks use the exact per-call inputs: hunk questions per scope,
  // change questions once against the whole diff.
  const scopeInputs = scopes.map((scope) => ({
    scope,
    inputChars: serializedInputChars(scope.state, scopedMode ? questionsHunk : questions),
  }));
  for (const { inputChars } of scopeInputs) {
    if (inputChars > SAFE_SERIALIZED_INPUT_CHARS) {
      out.error(
        `review-error: planned Jev input is ${inputChars} characters before tokenization. ` +
        `Jev accepts at most ${JEV_INPUT_TOKEN_LIMIT} input tokens; reduce maxDiffChars, preferences, or review scope.`,
      );
      return 2;
    }
  }
  let changeInputChars = 0;
  if (changeState) {
    if (changeState.diff.length > config.maxDiffChars) {
      out.error(
        `review-error: whole diff (${changeState.diff.length} chars) exceeds the ${config.maxDiffChars}-character per-request budget for change-scoped preferences. ` +
        "Review a smaller change or narrow scope with --include/--exclude; incomplete input is not approval.",
      );
      return 2;
    }
    changeInputChars = serializedInputChars(changeState, questionsChange);
    if (changeInputChars > SAFE_SERIALIZED_INPUT_CHARS) {
      out.error(
        `review-error: planned Jev input is ${changeInputChars} characters before tokenization. ` +
        `Jev accepts at most ${JEV_INPUT_TOKEN_LIMIT} input tokens; reduce maxDiffChars, preferences, or review scope.`,
      );
      return 2;
    }
  }
  if (dryRun) {
    const shownQuestions = displayQuestions(questions);
    const prefSummaries = config.prefs.map((p) => prefsSuite.summarizePreference(p));
    const largestScopeInput = Math.max(0, ...scopeInputs.map((s) => s.inputChars), changeInputChars);
    const budget = {
      tokenLimit: JEV_INPUT_TOKEN_LIMIT,
      safeSerializedChars: SAFE_SERIALIZED_INPUT_CHARS,
      maxDiffChars: config.maxDiffChars,
      scopeCount: scopes.length,
      maxHunks: config.maxHunks,
      changeScoped: changePrefs.length,
      largestInputChars: largestScopeInput,
      fits: largestScopeInput <= SAFE_SERIALIZED_INPUT_CHARS,
    };
    const preview = scopedMode
      ? {
        mode: "dry-run",
        granularity: scopeKind,
        suites: config.suites,
        prefs: prefSummaries,
        scopes: scopes.map((s, i) => ({
          label: s.label || "(whole-diff)",
          file: s.file,
          start: s.start,
          count: s.count,
          prefIds: hunkPrefs.map((p) => p.id),
          inputChars: scopeInputs[i].inputChars,
          stateChars: s.state.diff.length,
          state: { diff: s.state.diff.slice(0, 500) },
        })),
        ...(changeState
          ? {
            change: {
              label: "change",
              prefIds: changePrefs.map((p) => p.id),
              inputChars: changeInputChars,
              stateChars: changeState.diff.length,
              state: { diff: changeState.diff.slice(0, 500) },
            },
          }
          : {}),
        questions: shownQuestions,
        budget,
        note: `Jev input limit: ${JEV_INPUT_TOKEN_LIMIT} tokens (${SAFE_SERIALIZED_INPUT_CHARS} serialized chars guard); diff budget per request: ${config.maxDiffChars} characters. Pref list appears once above; scopes carry pref ids only. Conditions are Jev native type noul (Bernoulli p(true) -> {chance}); choices carry criteria labels.`,
      }
      : {
        mode: "dry-run",
        granularity: "whole-diff",
        suites: config.suites,
        prefs: prefSummaries,
        state: { diff: scopes[0].state.diff.slice(0, 2000) },
        questions: shownQuestions,
        budget,
      };
    out.log(JSON.stringify(preview, null, 2));
    return 0;
  }

  // One Jev call per scope plus one for change-scoped prefs, sequential
  // (rate-limit friendly). The client loads lazily so --dry-run works with
  // zero dependencies installed.
  const { evaluate, JevError, JevOverloadedError } = await import("../jev.js");
  const scopeResults = [];
  let changeResult = null;
  const rawMode = config.raw === true;
  const rawScopes = [];
  try {
    const hasHunkQuestions = Object.keys(questionsHunk).length > 0;
    // Skip per-scope calls when only change-scoped prefs remain and the
    // secrets suite is off — there would be no questions to ask per scope.
    if (hasHunkQuestions || !changeState) {
      for (const scope of scopes) {
        const answers = await evaluate({
          state: scope.state,
          questions: scopedMode ? questionsHunk : questions,
          client,
          timeoutMs,
        });
        if (rawMode) {
          rawScopes.push({ ...scope, state: undefined, results: rawSuites(config, answers, scopedMode ? hunkPrefs : config.prefs) });
          continue;
        }
        const suiteVerdicts = judgeSuites(config, answers, scopedMode ? hunkPrefs : config.prefs);
        scopeResults.push({ ...scope, state: undefined, suiteVerdicts, outcome: worstOf(suiteVerdicts) });
      }
    }
    if (changeState) {
      const answers = await evaluate({ state: changeState, questions: questionsChange, client, timeoutMs });
      if (rawMode) {
        rawScopes.push({ label: "change", files: scopes.flatMap((s) => s.files ?? []), results: rawSuites({ ...config, suites: ["prefs"] }, answers, changePrefs) });
      } else {
        const judged = prefsSuite.judge(changePrefs, answers, config);
        const suiteVerdicts = [{ suite: "prefs", ...judged }];
        changeResult = { label: "change", outcome: judged.outcome, suiteVerdicts };
      }
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

  const allVerdicts = [...scopeResults.flatMap((s) => s.suiteVerdicts), ...(changeResult ? changeResult.suiteVerdicts : [])];
  const overall = worstOf(allVerdicts);
  const advisoryCount = countAdvisories(allVerdicts);
  if (rawMode) {
    // Observation only: no verdict, no handoff, exit 0. failOn is ignored.
    const payload = {
      mode: "raw",
      intro: RAW_INTRO,
      thresholds: { gateThreshold: config.gateThreshold, advisoryThreshold: config.advisoryThreshold },
      scopes: rawScopes.map((s) => ({
        label: s.label || "(whole-diff)",
        file: s.file,
        start: s.start,
        count: s.count,
        results: s.results,
      })),
      files: [...new Set(rawScopes.flatMap((s) => s.files ?? []))],
    };
    out.log(json ? JSON.stringify(payload) : renderRaw(rawScopes, config));
    return 0;
  }
  let text;
  let payload;
  if (scopeResults.length === 1 && !scopeResults[0].label && !changeResult) {
    text = renderVerdict(scopeResults[0].suiteVerdicts);
    payload = { outcome: overall, advisoryCount, suites: scopeResults[0].suiteVerdicts, files: [] };
  } else if (scopeResults.length === 0 && changeResult) {
    text = renderVerdict(changeResult.suiteVerdicts, "change");
    payload = {
      outcome: overall,
      advisoryCount,
      change: { outcome: changeResult.outcome, suites: changeResult.suiteVerdicts },
      files: [...new Set((scopes.flatMap((s) => s.files ?? [])))],
    };
  } else {
    const blocks = scopeResults.map((s) => renderVerdict(s.suiteVerdicts, s.label));
    if (changeResult) blocks.push(renderVerdict(changeResult.suiteVerdicts, "change"));
    const changeSuffix = changeResult ? " + change" : "";
    const advisorySuffix = overall === "fix_now" || advisoryCount === 0 ? "" : `, ${advisoryCount} ${advisoryCount === 1 ? "advisory" : "advisories"}`;
    const headOutcome = overall === "approve" && advisoryCount > 0
      ? `approve with ${advisoryCount} ${advisoryCount === 1 ? "advisory" : "advisories"}`
      : overall;
    text = `${headOutcome} (${scopeResults.length} ${scopeKind} scopes${changeSuffix}${advisorySuffix})\n${blocks.join("\n")}`;
    payload = {
      outcome: overall,
      advisoryCount,
      scopes: scopeResults.map((s) => ({ label: s.label, file: s.file, start: s.start, count: s.count, outcome: s.outcome, suites: s.suiteVerdicts })),
      ...(changeResult ? { change: { outcome: changeResult.outcome, suites: changeResult.suiteVerdicts } } : {}),
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
