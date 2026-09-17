// `jev-pref` dispatcher. Exit contract: 0 ok/approve, 1 gate failure,
// 2 config/infra/usage error (never treat as approval).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boolFlag, InvalidArgs, parseArgs } from "./args.js";
import { commandHelp } from "./help.js";
import { doctor } from "./commands/doctor.js";
import { init } from "./commands/init.js";
import { review } from "./commands/review.js";
import { tune } from "./commands/tune.js";

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
  review    judge the diff with Jev (working tree, --staged, --diff, --pr)
  init      write jev-pref.json + wire the run instruction into agent files
  tune      calibrate thresholds against evals/
  doctor    sanity check (node, git, keys, config)
  help [command] | --help | -h
  version | --version | -V

Config precedence: flags > JEV_* env > jev-pref.json > CLAUDE.md/AGENTS.md
fenced block > defaults. Keys are env-only (JEV_API_KEY, else advocaat's
TYPESAFE_API_KEY → AI_GATEWAY_API_KEY → VERCEL_OIDC_TOKEN cascade).

Exit codes: 0 approve/ok, 1 gate violated, 2 infra/config/usage error.
Run \`jev-pref <command> --help\` for command details and full semantics.
`;

// Per-command known flags (long names plus single-char shorts the command
// honors). Unknown flags are rejected (exit 2), never silently ignored.
const KNOWN_FLAGS = {
  review: new Set([
    "diff", "staged", "pr", "suites", "json", "dry-run", "n", "hunks", "no-hunks",
    "max-hunks", "include", "exclude", "agent-cmd", "agent-input", "agent-on",
    "agent-timeout-ms", "gate-threshold", "advisory-threshold", "severity-fail",
    "fail-on", "config", "model", "base-url", "provider", "timeout-ms",
    "max-diff-chars", "help", "h",
  ]),
  init: new Set([
    "yes", "y", "stack", "scope", "suites", "trigger", "wire", "hunks",
    "agent-cmd", "out", "print", "help", "h",
  ]),
  tune: new Set(["sweep", "check", "evals-dir", "dry-run", "config", "help", "h"]),
  doctor: new Set(["verbose", "v", "config", "help", "h"]),
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
  try {
    switch (cmd) {
      case "review":
        return await review(parsed, ctx);
      case "doctor":
        return await doctor(parsed, ctx);
      case "init":
        return await init(parsed, ctx);
      case "tune":
        return await tune(parsed, ctx);
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
