// Per-command help text. Keep in sync with cli.js KNOWN_FLAGS and each
// command's actual flag handling — every flag listed here must work.
const REVIEW = `jev-pref review — judge the working tree / staged / ref range with Jev

Usage: jev-pref review [options]

Scope (default: working tree vs HEAD; mutually exclusive):
  --diff REF        git ref or range (e.g. HEAD~1, main...HEAD). Allowlisted
                    [A-Za-z0-9_.~/:{}^-]; must not start with '-'.
  --diff -          read the diff from stdin (no repo needed):
                    git diff HEAD~1 | jev-pref review --diff -
                    Pre-filter upstream (git diff -- src/ | ...); --include /
                    --exclude apply to git scopes only.
  --staged          review staged changes only (pre-commit). Untracked files
                    are NOT included in --staged / --diff / --pr scope.
  --pr              base...HEAD of the current PR via 'gh pr view' (needs gh).

Granularity:
  --hunks           one Jev call per hunk/new-file (file:line verdicts).
                    Default whole-diff (one call). JEV_HUNKS=1 also enables.
  --no-hunks        force whole-diff even if config sets hunks:true.
  --max-hunks N     cap hunk scopes before whole-diff fallback (default 10).

Filter:
  --include G       only paths matching glob G (repeatable, comma-separated).
  --exclude G       skip paths matching glob G (repeatable).

Suites & thresholds:
  --suites a,b      csv subset (known: prefs, secrets). Default from config.
  --gate-threshold N       P cutoff for gate prefs / secrets (0..1).
  --advisory-threshold N   P cutoff for advisory prefs (0..1).
  --severity-fail N        drift score that forces fix_now (>= 0).
  --fail-on gates|all|never   gates: exit 1 only on fix_now (default).
                              all: exit 1 on advisory too. never: always 0.

Agent handoff (verdict piped to your command, argv only — never a shell):
  --agent-cmd BIN          e.g. --agent-cmd "claude -p" (whitespace-split;
                           prefer config array form for exact args).
                           Placeholders in args: {verdict} {json} {files}
                           {outcome} ({json} omits the diff — argv has OS
                           limits; stdin always carries the full payload).
  --agent-input json|text|none   stdin payload (default json).
  --agent-on LIST          csv outcomes that trigger it (default fix_now).
  --agent-timeout-ms MS    handoff timeout (default 300000).

Client:
  --config PATH     config file (default ./jev-pref.json). JEV_CONFIG also.
  --model M --base-url U --provider typesafe|vercel --timeout-ms MS
  --max-diff-chars N       diff budget before truncation note (default 24000).

Output:
  --json            machine-readable verdict on stdout (progress goes to
                    stderr, so stdout stays parseable).
  --dry-run, -n     print questions/state without calling Jev (free).

Exit codes: 0 approve/ok, 1 gate violated, 2 config/infra/usage error.
Keys are env-only: JEV_API_KEY, else TYPESAFE_API_KEY → AI_GATEWAY_API_KEY
→ VERCEL_OIDC_TOKEN (advocaat cascade). Never committed.
`;

const INIT = `jev-pref init — interview-to-config writer for the skill's setup flow

Usage: jev-pref init [--yes] [options]

  --yes             non-interactive defaults (for CI / confirmed answers).
  --stack S         gateway|direct|effect|python|cli (default gateway).
  --scope S         working-tree|staged|pr (controls the wired review command).
  --suites S        csv suites (default prefs).
  --trigger T       when review runs, in your words (default "after every task").
  --wire W          claude|agents|both|none — which agent files to append
                    the fenced block + run instruction to (default both).
  --hunks           write hunks:true into the config (per-hunk review).
  --agent-cmd BIN   write an agent handoff block (whitespace-split command).
  --out PATH        config path (default ./jev-pref.json).
  --print           print the fenced block to stdout instead of writing files.

Exit codes: 0 wrote/printed, 2 bad answers/usage error.
`;

const TUNE = `jev-pref tune — calibrate thresholds against labeled evals

Usage: jev-pref tune [--sweep] [--check[=N]] [--evals-dir DIR] [--dry-run]
       [--config PATH]

  evals/*.json: { name, diff, expected: { prefId: true|false } }.
  (default dir ./evals; --evals-dir overrides.)
  --sweep           try thresholds 0.5..0.9, propose the best as a config diff.
  --check           fail (exit 1) if accuracy @ gateThreshold is below the bar
                    (0.5 bare; --check=0.8 to set it). For CI gates.
  --dry-run         list runnable cases without calling Jev (free).
  --config PATH     config file (default ./jev-pref.json).

Needs a live key (same cascade as review). Exit codes: 0 ok, 1 --check
below bar, 2 config/infra/usage error.
`;

const DOCTOR = `jev-pref doctor — environment sanity check

Usage: jev-pref doctor [--verbose] [--config PATH]

Checks node >= 20, git, config validity; reports (never prints) key
presence and gh availability. gh is advisory-only (needed just for --pr).
Exit codes: 0 all required checks pass, 2 something needs fixing.
`;

export function commandHelp(cmd) {
  switch (cmd) {
    case "review":
      return REVIEW;
    case "init":
      return INIT;
    case "tune":
      return TUNE;
    case "doctor":
      return DOCTOR;
    default:
      return `unknown command ${JSON.stringify(cmd)} (see: jev-pref help)`;
  }
}
