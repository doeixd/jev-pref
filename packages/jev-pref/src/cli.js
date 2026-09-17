// `jev-pref` dispatcher. Exit contract: 0 ok/approve, 1 gate failure,
// 2 config/infra/usage error (never treat as approval).
import { InvalidArgs, parseArgs } from "./args.js";
import { doctor } from "./commands/doctor.js";
import { init } from "./commands/init.js";
import { review } from "./commands/review.js";
import { tune } from "./commands/tune.js";

const VERSION = "0.1.0";

const HELP = `jev-pref — Jev-powered user-preference code reviewer

Usage: jev-pref <command> [options]

Commands:
  review [--diff REF] [--staged] [--pr] [--suites a,b] [--json] [--dry-run]
         [--gate-threshold N] [--advisory-threshold N] [--fail-on gates|all|never]
         [--config PATH] [--model M] [--timeout-ms MS]
  init [--yes] [--stack S] [--scope S] [--suites S] [--trigger T]
       [--wire claude|agents|both|none] [--out PATH] [--print]
  tune [--sweep] [--evals-dir DIR] [--dry-run]
  doctor [--verbose]
  help | --help | -h
  version | --version | -V

Config precedence: flags > JEV_* env > jev-pref.json > CLAUDE.md/AGENTS.md
fenced block > defaults. Keys are env-only: JEV_API_KEY (or advocaat's
TYPESAFE_API_KEY → AI_GATEWAY_API_KEY → VERCEL_OIDC_TOKEN cascade).

Exit codes: 0 approve/ok, 1 gate violated, 2 infra/config/usage error.
`;

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
  if (!cmd || cmd === "help" || parsed.flags.help || parsed.flags.h) {
    out.log(HELP);
    return 0;
  }
  if (cmd === "version" || parsed.flags.version || parsed.flags.V) {
    out.log(`jev-pref ${VERSION}`);
    return 0;
  }
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
    out.error(`review-error: ${e?.message ?? String(e)}`);
    return 2;
  }
}
