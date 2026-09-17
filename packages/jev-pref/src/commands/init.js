// `jev-pref init` — the skill's interview as code. Three modes:
//   TTY (stdin is a terminal): guided wizard — every question explains what it
//     controls, enums re-ask until valid, then a preview + confirm.
//   Piped (`init < answers.txt`): one answer per line, wizard order (flag-
//     given answers like --wire consume no lines); same validation.
//     Exhausted input is an error, never a hang.
//   `--yes`: non-interactive flag defaults (for CI / confirmed answers).
// `--print` prints both outputs without writing. Existing prefs are never
// wiped without `--force`. Writes jev-pref.json plus the fenced ```jev-prefs
// block + run instruction to CLAUDE.md / AGENTS.md.
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { boolFlag, strFlag } from "../args.js";
import { SUITES } from "./review.js";

const FENCE = "```jev-prefs";
const KNOWN_SUITES = Object.keys(SUITES);

const STACKS = ["gateway", "direct", "effect", "python", "cli"];
const SCOPES = ["working-tree", "staged", "pr"];
const WIRES = ["claude", "agents", "both", "none"];

// Question flow (order = piped-answer order). `def` may be a thunk of cwd.
const FLOW = [
  {
    key: "stack", kind: "enum", options: STACKS, def: "gateway", ask: "stack",
    about: [
      "stack — how Jev is reached. The engine covers gateway + direct out of the box;",
      "effect / python / cli need a hand-authored script (the skill guides you).",
    ],
  },
  {
    key: "scope", kind: "enum", options: SCOPES, def: "working-tree", ask: "scope",
    about: [
      "scope — which changes get judged. This controls the wired `review` command:",
      "working-tree reviews everything vs HEAD; staged is for pre-commit; pr uses `gh`.",
    ],
  },
  {
    key: "suites", kind: "suites", def: "prefs", ask: "suites",
    about: [
      "suites — comma-separated. prefs = your preferences (you'll add them next);",
      "secrets = built-in credential/PII gate. Recommended: prefs,secrets.",
    ],
  },
  {
    key: "trigger", kind: "text", def: "after every task", ask: "run trigger",
    about: ["run trigger — your words for WHEN review runs (goes verbatim into the wired instruction)."],
  },
  {
    key: "wire", kind: "enum", options: WIRES, def: "both", ask: "wire",
    about: ["wire — where the run instruction goes (agent files are created if missing)."],
  },
  {
    key: "hunks", kind: "yesno", def: "no", ask: "per-hunk review",
    about: ["per-hunk review — one Jev call per hunk with file:line verdicts (better for PRs) instead of one cheap whole-diff call? (yes/no)"],
  },
  {
    key: "agentCmd", kind: "agent", def: "", ask: "agent handoff",
    about: ["agent handoff — command to pipe failing verdicts into for auto-fix/escalation (empty = just report)."],
  },
  {
    key: "outPath", kind: "path", def: (cwd) => join(cwd, "jev-pref.json"), ask: "config path",
    about: [],
  },
];

function say(out, lines) {
  for (const line of lines) out.log(line);
}

function inputEnded() {
  return new Error("input ended before all answers were given (run interactively or pass --yes with flags)");
}

/** TTY prompt primitive (readline handles echo + line editing on terminals). */
function askPrompt(rl, question, def) {
  return new Promise((resolve, reject) => {
    const onClose = () => reject(inputEnded());
    rl.once("close", onClose);
    try {
      rl.question(`${question}${def !== undefined ? ` [${def}]` : ""}: `, (answer) => {
        rl.removeListener("close", onClose);
        const v = answer.trim();
        resolve(v === "" ? def : v);
      });
    } catch {
      rl.removeListener("close", onClose);
      reject(inputEnded());
    }
  });
}

/**
 * Run the question flow. `ask(prompt, def)` returns the raw answer.
 * Interactive TTYs re-ask bad enums; batch mode fails fast naming the question.
 */
export async function runFlow(ask, out, { interactive, flags = {}, cwd = ".", skip = new Set() } = {}) {
  const answers = {};
  // Flag-given answers skip their questions everywhere (no wasted lines).
  if (flags.hunks !== undefined) skip.add("hunks");
  if (strFlag(flags, "agent-cmd") !== undefined) skip.add("agentCmd");
  for (const q of FLOW) {
    if (skip.has(q.key)) continue;
    say(out, q.about);
    const def = typeof q.def === "function" ? q.def(cwd) : q.def;
    if (q.kind === "enum") {
      for (;;) {
        const raw = await ask(`${q.ask} (${q.options.join("/")})`, def);
        if (q.options.includes(raw)) {
          answers[q.key] = raw;
          break;
        }
        const msg = `pick one of: ${q.options.join(", ")}`;
        if (!interactive) throw new Error(`review-error: ${q.key}: got ${JSON.stringify(raw)} — ${msg}`);
        out.log(msg);
      }
    } else {
      answers[q.key] = await ask(q.ask, def);
    }
  }
  answers.suites = String(answers.suites ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const hunksAnswer = flags.hunks !== undefined
    ? (boolFlag(flags, "hunks") ? "yes" : answers.hunks)
    : answers.hunks;
  answers.hunks = ["1", "true", "yes"].includes(String(hunksAnswer).toLowerCase());
  const agentCmd = strFlag(flags, "agent-cmd") ?? answers.agentCmd;
  answers.agentCmd = agentCmd === "" ? undefined : agentCmd;
  return answers;
}

/** Shared by all modes: every answer validated before anything is written. */
export function validateAnswers(answers) {
  const errors = [];
  if (!STACKS.includes(answers.stack)) {
    errors.push(`unknown stack ${JSON.stringify(answers.stack)} (known: ${STACKS.join(", ")})`);
  }
  if (!SCOPES.includes(answers.scope)) {
    errors.push(`unknown scope ${JSON.stringify(answers.scope)} (known: ${SCOPES.join(", ")})`);
  }
  if (!WIRES.includes(answers.wire)) {
    errors.push(`unknown wire target ${JSON.stringify(answers.wire)} (known: ${WIRES.join(", ")})`);
  }
  if (answers.suites.length === 0) {
    errors.push("suites: pick at least one suite");
  }
  const unknown = answers.suites.filter((s) => !KNOWN_SUITES.includes(s));
  if (unknown.length > 0) {
    errors.push(`unknown suites: ${unknown.join(", ")} (known: ${KNOWN_SUITES.join(", ")})`);
  }
  if (String(answers.trigger ?? "").trim() === "") {
    errors.push("trigger must not be empty (when should review run?)");
  }
  const agentCommand = (answers.agentCmd ?? "").split(/\s+/).filter(Boolean);
  if (answers.agentCmd !== undefined && agentCommand.length === 0) {
    errors.push("agent-cmd must not be empty (omit it for no handoff)");
  }
  return errors;
}

/** Pure plan-building from validated answers (shared by write + print paths). */
export function buildPlan(answers, cwd) {
  const agentCommand = (answers.agentCmd ?? "").split(/\s+/).filter(Boolean);
  const config = {
    $schema: "https://raw.githubusercontent.com/doeixd/jev-pref/main/packages/jev-pref/schema.json",
    suites: answers.suites,
    gateThreshold: 0.7,
    advisoryThreshold: 0.7,
    failOn: "gates",
    ...(answers.hunks ? { hunks: true } : {}),
    ...(agentCommand.length > 0 ? { agent: { command: agentCommand, on: ["fix_now"] } } : {}),
    prefs: [],
  };
  const reviewCmd = [
    "npx jev-pref review",
    answers.scope === "pr" ? "--pr" : answers.scope === "staged" ? "--staged" : null,
    answers.hunks ? "--hunks" : null,
  ].filter(Boolean).join(" ");
  const triggerText = answers.trigger[0].toUpperCase() + answers.trigger.slice(1);
  const block = `${FENCE}\n${JSON.stringify(config, null, 2)}\n\`\`\`\n\n## Preference review (Jev)\n\n${triggerText}, run:\n\n  ${reviewCmd}\n\n- Exit 1 (gate violated) → fix the flagged prefs and re-run (max 3 times, then escalate).\n- Exit 0 with advisory notes → address or explicitly note why not.\n- Exit 0 clean → continue.\n- Exit 2 (config/infra error) → fix setup; never treat as approval.\n- Keys come from the environment (\`JEV_API_KEY\`/\`TYPESAFE_API_KEY\`/\`AI_GATEWAY_API_KEY\`); never commit them.\n`;
  const outPath = isAbsolute(answers.outPath) ? answers.outPath : resolve(cwd, answers.outPath);
  const targets = answers.wire === "both"
    ? [join(cwd, "CLAUDE.md"), join(cwd, "AGENTS.md")]
    : answers.wire === "claude"
    ? [join(cwd, "CLAUDE.md")]
    : answers.wire === "agents"
    ? [join(cwd, "AGENTS.md")]
    : [];
  return { config, reviewCmd, block, outPath, targets, agentCommand };
}

/** Slurp piped stdin up front (cap 1MB — answers are short). */
async function readPipedInput(input) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of input) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    chunks.push(buf);
    bytes += buf.length;
    if (bytes > 1024 * 1024) break;
  }
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

export async function init(argv, { cwd = ".", out = console, input = process.stdin, output = process.stdout } = {}) {
  const { flags } = argv;
  const yes = boolFlag(flags, "yes") || boolFlag(flags, "y");
  const print = boolFlag(flags, "print");
  const wireTarget = strFlag(flags, "wire");

  let answers;
  let confirm;
  try {
    if (yes) {
    answers = {
      stack: strFlag(flags, "stack") ?? "gateway",
      scope: strFlag(flags, "scope") ?? "working-tree",
      suites: parseSuites(strFlag(flags, "suites") ?? "prefs"),
      trigger: strFlag(flags, "trigger") ?? "after every task",
      wire: wireTarget ?? "both",
      hunks: boolFlag(flags, "hunks"),
      agentCmd: strFlag(flags, "agent-cmd"),
      outPath: strFlag(flags, "out") ?? join(cwd, "jev-pref.json"),
    };
    confirm = async () => true;
  } else if (input.isTTY) {
    say(out, [
      "jev-pref init — 8 questions. Each shows what it controls; defaults in [brackets].",
      "Nothing is written until the preview at the end (or pass --yes to skip prompts).",
      "",
    ]);
    const overlays = {};
    if (wireTarget !== undefined) overlays.wire = wireTarget;
    const outFlag = strFlag(flags, "out");
    if (outFlag !== undefined) overlays.outPath = outFlag;
    const skip = new Set(Object.keys(overlays));
    const rl = createInterface({ input, output });
    try {
      const ask = (prompt, def) => askPrompt(rl, prompt, def);
      answers = await runFlow(ask, out, { interactive: true, flags, cwd, skip });
      Object.assign(answers, overlays);
    } finally {
      rl.close();
    }
    confirm = async () => {
      const rl2 = createInterface({ input, output });
      try {
        return await new Promise((resolve, reject) => {
          const onClose = () => reject(inputEnded());
          rl2.once("close", onClose);
          try {
            rl2.question("Proceed? [yes]: ", (answer) => {
              rl2.removeListener("close", onClose);
              const v = answer.trim().toLowerCase();
              resolve(v === "" || ["1", "true", "yes", "y"].includes(v));
            });
          } catch {
            rl2.removeListener("close", onClose);
            reject(inputEnded());
          }
        });
      } finally {
        rl2.close();
      }
    };
  } else {
    // Piped answers: same order, same validation. Exhausted input (or a bad
    // enum) fails fast — never a hang, never a half-written setup.
    const lines = await readPipedInput(input);
    const ask = async (prompt, def) => {
      if (lines.length === 0) throw inputEnded();
      const raw = lines.shift().trim();
      const v = raw === "" ? def : raw;
      out.log(`${prompt}${def !== undefined ? ` [${def}]` : ""}: ${raw}`);
      return v;
    };
    say(out, ["jev-pref init — reading answers from stdin (wizard order; --wire/--out/--hunks/--agent-cmd flags skip their questions).", ""]);
    const batchSkip = new Set();
    if (wireTarget !== undefined) batchSkip.add("wire");
    if (strFlag(flags, "out") !== undefined) batchSkip.add("outPath");
    answers = await runFlow(ask, out, {
      interactive: false,
      flags,
      cwd,
      skip: batchSkip,
    });
    if (wireTarget !== undefined) answers.wire = wireTarget;
    const outFlag = strFlag(flags, "out");
    if (outFlag !== undefined) answers.outPath = outFlag;
    confirm = async () => {
      if (lines.length === 0) throw inputEnded();
      const raw = lines.shift().trim().toLowerCase();
      out.log(`Proceed?: ${raw}`);
      return ["1", "true", "yes", "y"].includes(raw);
    };
  }
  } catch (e) {
    const msg = e?.message ?? String(e);
    out.error(msg.startsWith("review-error:") ? msg : `review-error: ${msg}`);
    return 2;
  }

  const errors = validateAnswers(answers);
  if (errors.length > 0) {
    for (const e of errors) out.error(`review-error: ${e}`);
    return 2;
  }
  const { config, reviewCmd, block, outPath, targets, agentCommand } = buildPlan(answers, cwd);

  if (print) {
    out.log(`--- ${outPath} ---`);
    out.log(JSON.stringify(config, null, 2));
    out.log(`--- fenced block (${targets.length > 0 ? targets.join(", ") : "nowhere — wire=none"}) ---`);
    out.log(block);
    return 0;
  }

  // Never silently wipe an existing prefs array: re-entry runs must merge by
  // hand (or pass --force).
  if (!boolFlag(flags, "force")) {
    let existingConfig;
    try {
      existingConfig = JSON.parse(await readFile(outPath, "utf8"));
    } catch (e) {
      if (e instanceof SyntaxError) {
        out.error(`review-error: ${outPath} has invalid JSON — fix or delete it first (refusing to overwrite)`);
        return 2;
      }
      // Missing/unreadable: fresh write below; writeFile surfaces real IO errors.
    }
    if (existingConfig && Array.isArray(existingConfig.prefs) && existingConfig.prefs.length > 0) {
      out.error(`review-error: ${outPath} already has ${existingConfig.prefs.length} prefs — merge by hand or re-run with --force to overwrite`);
      return 2;
    }
  }

  if (!yes) {
    say(out, [
      "Preview — about to write:",
      `  config: ${outPath} (suites: ${answers.suites.join(",")}; scope: ${answers.scope} → \`${reviewCmd}\`; hunks: ${answers.hunks ? "on" : "off"}; agent handoff: ${agentCommand.length > 0 ? agentCommand.join(" ") : "none"})`,
      `  wire: ${targets.length > 0 ? targets.join(", ") : "nothing (wire=none)"} (append run instruction; existing jev-prefs blocks are left alone)`,
      `  note: prefs starts empty — you add them next (step 1 below).`,
    ]);
    let proceed;
    try {
      proceed = await confirm();
    } catch (e) {
      out.error(`review-error: ${e?.message ?? String(e)}`);
      return 2;
    }
    if (!proceed) {
      out.log("aborted; nothing written.");
      return 0;
    }
  }

  await writeFile(outPath, JSON.stringify(config, null, 2) + "\n");
  out.log(`wrote ${outPath}`);

  for (const target of targets) {
    let existing = "";
    try {
      existing = await readFile(target, "utf8");
    } catch {
      // Create the file if missing (interview promises this).
    }
    if (existing.includes(FENCE)) {
      out.log(`skipped ${target} (already has a jev-prefs block)`);
      continue;
    }
    await writeFile(target, `${existing}${existing.endsWith("\n") || existing === "" ? "" : "\n"}\n${block}`);
    out.log(`wired ${target}`);
  }
  say(out, [
    "Next:",
    `  1. Add your prefs to ${outPath} ("prefs": [{ id, gate, text }]) — see the jev-pref skill references/prefs-to-questions.md.`,
    "  2. npx jev-pref review --dry-run  (free preview of questions)",
    "  3. npx jev-pref review  (needs a key in env)",
    "  4. npx jev-pref tune --sweep  (after real verdicts accumulate)",
  ]);
  if (answers.stack === "effect") {
    out.log('note: stack "effect" uses the hand-authored template — see the jev-pref skill assets/review-script-effect.ts');
  } else if (answers.stack !== "gateway" && answers.stack !== "direct") {
    out.log(`note: stack "${answers.stack}" has no bundled template yet — see the jev-pref skill for hand-authoring guidance`);
  }
  return 0;
}

function parseSuites(raw) {
  return String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
