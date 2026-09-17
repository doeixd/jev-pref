// `jev-pref init` — the skill's interview as code. Interactive wizard with
// --yes non-interactive defaults for CI. Writes jev-pref.json (or stdout with
// --print) and optionally appends the fenced ```jev-prefs block + run
// instruction to CLAUDE.md / AGENTS.md.
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { boolFlag, strFlag } from "../args.js";

const FENCE = "```jev-prefs";

function askPrompt(rl, question, def) {
  return new Promise((resolve) => {
    rl.question(`${question}${def !== undefined ? ` [${def}]` : ""}: `, (answer) => {
      const v = answer.trim();
      resolve(v === "" ? def : v);
    });
  });
}

const STACKS = ["gateway", "direct", "effect", "python", "cli"];
const SCOPES = ["working-tree", "staged", "pr"];

export async function init(argv, { cwd = ".", out = console, input = process.stdin, output = process.stdout } = {}) {
  const { flags } = argv;
  const yes = boolFlag(flags, "yes") || boolFlag(flags, "y");
  const print = boolFlag(flags, "print");
  const wireTarget = strFlag(flags, "wire"); // claude|agents|both|none

  let answers;
  if (yes) {
    answers = {
      stack: strFlag(flags, "stack") ?? "gateway",
      scope: strFlag(flags, "scope") ?? "working-tree",
      suites: (strFlag(flags, "suites") ?? "prefs").split(",").map((s) => s.trim()).filter(Boolean),
      trigger: strFlag(flags, "trigger") ?? "after every task",
      wire: wireTarget ?? "both",
      outPath: strFlag(flags, "out") ?? join(cwd, "jev-pref.json"),
    };
  } else {
    const rl = createInterface({ input, output });
    try {
      const stack = await askPrompt(rl, `stack (${STACKS.join("/")})`, "gateway");
      const scope = await askPrompt(rl, `scope (${SCOPES.join("/")})`, "working-tree");
      const suites = await askPrompt(rl, "suites (csv: prefs,secrets)", "prefs");
      const trigger = await askPrompt(rl, "run trigger (e.g. after every task)", "after every task");
      const wire = wireTarget ?? await askPrompt(rl, "wire (claude/agents/both/none)", "both");
      const outPath = await askPrompt(rl, "config path", join(cwd, "jev-pref.json"));
      answers = { stack, scope, suites: suites.split(",").map((s) => s.trim()).filter(Boolean), trigger, wire, outPath };
    } finally {
      rl.close();
    }
  }

  if (!STACKS.includes(answers.stack)) {
    out.error(`review-error: unknown stack ${JSON.stringify(answers.stack)} (known: ${STACKS.join(", ")})`);
    return 2;
  }
  if (!SCOPES.includes(answers.scope)) {
    out.error(`review-error: unknown scope ${JSON.stringify(answers.scope)} (known: ${SCOPES.join(", ")})`);
    return 2;
  }

  const config = {
    $schema: "https://raw.githubusercontent.com/doeixd/jev-pref/main/packages/jev-pref/schema.json",
    suites: answers.suites,
    gateThreshold: 0.7,
    advisoryThreshold: 0.7,
    failOn: "gates",
    prefs: [],
  };

  const reviewCmd = answers.scope === "pr"
    ? "npx jev-pref review --pr"
    : answers.scope === "staged"
    ? "npx jev-pref review --staged"
    : "npx jev-pref review";
  const block = `${FENCE}\n${JSON.stringify(config, null, 2)}\n\`\`\`\n\n## Preference review (Jev)\n\n${answers.trigger[0].toUpperCase()}${answers.trigger.slice(1)}, run:\n\n  ${reviewCmd}\n\n- Exit 1 (gate violated) → fix the flagged prefs and re-run (max 3 times, then escalate).\n- Exit 0 with advisory notes → address or explicitly note why not.\n- Exit 0 clean → continue.\n- Exit 2 (config/infra error) → fix setup; never treat as approval.\n- Keys come from the environment (\`JEV_API_KEY\`/\`TYPESAFE_API_KEY\`/\`AI_GATEWAY_API_KEY\`); never commit them.\n`;

  if (print) {
    out.log(block);
    return 0;
  }

  await writeFile(answers.outPath, JSON.stringify(config, null, 2) + "\n");
  out.log(`wrote ${answers.outPath} — now add your prefs to its "prefs" array (see skill references/prefs-to-questions.md)`);

  const targets = answers.wire === "both"
    ? [join(cwd, "CLAUDE.md"), join(cwd, "AGENTS.md")]
    : answers.wire === "claude"
    ? [join(cwd, "CLAUDE.md")]
    : answers.wire === "agents"
    ? [join(cwd, "AGENTS.md")]
    : [];
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
  if (answers.stack !== "gateway" && answers.stack !== "direct") {
    out.log(`note: stack "${answers.stack}" has no bundled template yet — see the jev-pref skill for hand-authoring guidance`);
  }
  return 0;
}
