// `jev-pref` dispatcher. Exit contract: 0 ok/approve, 1 gate failure,
// 2 config/infra/usage error (never treat as approval).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boolFlag, InvalidArgs, parseArgs } from "./args.js";
import { commandHelp } from "./help.js";

function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}
const VERSION = packageVersion();

const HELP = `jev-pref — Jev-powered user-preference code reviewer

Usage: jev-pref <command> [options]

Commands:
  setup     teach a coding agent how to configure this repository
  sync      teach an agent to reconcile guidance and Jev policy
  review    judge the diff with Jev (working tree, --staged, --diff, --pr)
  tune      calibrate thresholds against evals/
  doctor    sanity check (node, git, keys, config)
  examples  print copyable integration recipes
  init      deprecated alias; points agents to setup
  help [command] | --help | -h
  version | --version | -V

Config precedence: flags > JEV_* env > jev-pref.local.json > jev-pref.json >
agent-file fenced block > defaults. Keys are env-only (JEV_API_KEY, else advocaat's
TYPESAFE_API_KEY → AI_GATEWAY_API_KEY → VERCEL_OIDC_TOKEN cascade).

Exit codes: 0 approve/ok, 1 gate violated, 2 infra/config/usage error.
Run \`jev-pref <command> --help\` for command details and full semantics.
`;

// Per-command known flags (long names plus single-char shorts the command
// honors). Unknown flags are rejected (exit 2), never silently ignored.
const KNOWN_FLAGS = {
  setup: new Set(["help", "h"]),
  sync: new Set(["help", "h"]),
  review: new Set([
    "diff", "staged", "pr", "suites", "json", "dry-run", "n", "hunks", "no-hunks", "files", "no-files",
    "max-hunks", "include", "exclude", "agent-cmd", "agent-input", "agent-on",
    "agent-timeout-ms", "gate-threshold", "advisory-threshold",
    "fail-on", "config", "model", "base-url", "provider", "timeout-ms",
    "max-diff-chars", "help", "h",
  ]),
  init: new Set([
    "yes", "y", "stack", "scope", "suites", "trigger", "wire", "hunks",
    "agent-cmd", "out", "print", "force", "help", "h",
  ]),
  tune: new Set(["sweep", "check", "evals-dir", "dry-run", "config", "help", "h"]),
  doctor: new Set(["verbose", "v", "config", "help", "h"]),
  examples: new Set(["help", "h"]),
};

function rejectUnknownFlags(cmd, flags, out) {
  for (const key of Object.keys(flags)) {
    if (!KNOWN_FLAGS[cmd].has(key)) {
      out.error(`review-error: unknown --${key} for \`jev-pref ${cmd}\` (see: jev-pref ${cmd} --help)`);
      return false;
    }
  }
  return true;
}

export async function run(argv, { cwd = process.cwd(), out = console } = {}) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    if (e instanceof InvalidArgs) {
      out.error(`review-error: ${e.message}`);
      return 2;
    }
    throw e;
  }
  const cmd = parsed.command;

  // No command: global help / version.
  if (!cmd) {
    if (parsed.flags.version || parsed.flags.V) {
      out.log(`jev-pref ${VERSION}`);
      return 0;
    }
    out.log(HELP);
    return 0;
  }
  if (cmd === "help") {
    const topic = parsed.positional[0];
    if (topic && KNOWN_FLAGS[topic]) {
      out.log(commandHelp(topic));
      return 0;
    }
    if (topic) {
      out.error(`review-error: unknown command ${JSON.stringify(topic)} (see: jev-pref help)`);
      return 2;
    }
    out.log(HELP);
    return 0;
  }
  if (cmd === "version") {
    out.log(`jev-pref ${VERSION}`);
    return 0;
  }
  if (!KNOWN_FLAGS[cmd]) {
    out.error(`review-error: unknown command ${JSON.stringify(cmd)} (see: jev-pref help)`);
    return 2;
  }
  // Per-command --help (read defensively: garbage values are usage errors).
  let wantsHelp = false;
  try {
    wantsHelp = boolFlag(parsed.flags, "help", { presence: true }) || boolFlag(parsed.flags, "h", { presence: true });
  } catch (e) {
    if (e instanceof InvalidArgs) {
      out.error(`review-error: ${e.message}`);
      return 2;
    }
    throw e;
  }
  if (wantsHelp) {
    out.log(commandHelp(cmd));
    return 0;
  }
  if (!rejectUnknownFlags(cmd, parsed.flags, out)) return 2;
  const ctx = { cwd, out };
  // Commands load lazily so --help, doctor, and dry-run flows never require
  // the live Jev client (advocaat) to be installed.
  try {
    switch (cmd) {
      case "review":
        return await (await import("./commands/review.js")).review(parsed, ctx);
      case "setup":
        return await (await import("./commands/setup.js")).setup(parsed, ctx);
      case "sync":
        return await (await import("./commands/sync.js")).sync(parsed, ctx);
      case "doctor":
        return await (await import("./commands/doctor.js")).doctor(parsed, ctx);
      case "init":
        out.log("`jev-pref init` has been replaced by agent-assisted setup. No files were changed.\n\nRun:\n\n  npx jev-pref setup\n\nand follow the instructions it prints.");
        return 0;
      case "tune":
        return await (await import("./commands/tune.js")).tune(parsed, ctx);
      case "examples":
        return await (await import("./commands/examples.js")).examples(parsed, ctx);
      default:
        out.error(`review-error: unknown command ${JSON.stringify(cmd)} (see: jev-pref help)`);
        return 2;
    }
  } catch (e) {
    if (e instanceof InvalidArgs) {
      out.error(`review-error: ${e.message}`);
      return 2;
    }
    out.error(`review-error: ${e?.message ?? String(e)}`);
    return 2;
  }
}
