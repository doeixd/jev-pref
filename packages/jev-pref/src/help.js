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
                    Recommended for agent work. JEV_HUNKS=1 also enables.
  --no-hunks        force whole-diff even if config sets hunks:true.
  --files           one bounded Jev call per changed file/new file.
                    JEV_FILES=1 also enables. Mutually exclusive with --hunks.
  --no-files        disable file mode set by config/environment.
  --max-hunks N     maximum scoped calls (hunks, files, or split parts;
                    default 10). Overflow fails with guidance to narrow scope;
                    it never falls back to an oversized whole-diff request.

Filter:
  --include G       only paths matching glob G (repeatable, comma-separated).
  --exclude G       skip paths matching glob G (repeatable).

Suites & thresholds:
  --suites a,b      csv subset (known: prefs, secrets). Default from config.
  --gate-threshold N       P cutoff for gate prefs / secrets (0..1).
  --advisory-threshold N   P cutoff for advisory prefs (0..1).
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
  --config PATH     project config (default jev-pref.json, walking up to the
                    git root). A companion jev-pref.local.json loads after it.
                    JEV_CONFIG also.
  --model M --base-url U --provider typesafe|vercel --timeout-ms MS
  --max-diff-chars N       per-request diff budget (default 20000). Whole-diff
                           overflow fails; scoped modes split oversized units.

Output:
  --json            machine-readable verdict on stdout (progress goes to
                    stderr, so stdout stays parseable).
  --dry-run, -n     print questions/state without calling Jev (free).

Exit codes: 0 approve/ok, 1 gate violated, 2 config/infra/usage error.
Jev accepts at most 30k input tokens. Prefer small changes, --hunks, --files,
or --include/--exclude. Partial/truncated diffs are never treated as approval.
Keys are env-only: JEV_API_KEY, else TYPESAFE_API_KEY → AI_GATEWAY_API_KEY
→ VERCEL_OIDC_TOKEN (advocaat cascade). Never committed.
`;

const SETUP = `jev-pref setup — teach a coding agent how to configure jev-pref

Usage: jev-pref setup

Inspects high-signal repository files and prints a repository-aware setup
protocol. It does not interview the user or write files; the coding agent
follows the protocol, asks the user, and edits the repository.

Exit codes: 0 instructions printed, 2 usage error.
`;

const SYNC = `jev-pref sync — reconcile project guidance and Jev preferences

Usage: jev-pref sync

Prints a repository-aware protocol for checking bidirectional semantic drift
between human-readable project guidance, shared/personal Jev policy, and review
wiring. It never edits files or makes policy decisions itself.

Exit codes: 0 instructions printed, 2 usage error.
`;

const INIT = `jev-pref init — deprecated

Agent-assisted setup replaces the interactive initializer. Run:

  npx jev-pref setup

No files are changed by this compatibility alias.
`;

const EXAMPLES = `jev-pref examples — print copyable integration recipes

Usage: jev-pref examples [agent-loop|pre-commit|github-action|review-script]

With no name, lists the available recipes. Recipes demonstrate the CLI and
JSON/exit-code contract without creating files.
`;

const TUNE = `jev-pref tune — calibrate thresholds against labeled evals

Usage: jev-pref tune [--sweep] [--check[=N]] [--evals-dir DIR] [--dry-run]
       [--config PATH]

  evals/*.json: condition expected values are true|false; choice expected
                values are configured label strings.
  (default dir ./evals; --evals-dir overrides.)
  --sweep           try thresholds 0.5..0.9, propose the best as a config diff.
  --check           fail (exit 1) if accuracy @ gateThreshold is below the bar
                    (0.5 bare; --check=0.8 to set it). For CI gates.
  --dry-run         list runnable cases without calling Jev (free).
  --config PATH     project config (default jev-pref.json, walking up to the
                    git root); a companion jev-pref.local.json loads after it.

Needs a live key (same cascade as review). Exit codes: 0 ok, 1 --check
below bar, 2 config/infra/usage error.
`;

const DOCTOR = `jev-pref doctor — environment sanity check

Usage: jev-pref doctor [--verbose] [--config PATH]

Checks node >= 20, git, merged project/local config validity; reports (never
prints) key presence and gh availability. --verbose shows config provenance.
gh is advisory-only (needed just for --pr).
Exit codes: 0 all required checks pass, 2 something needs fixing.
`;

export function commandHelp(cmd) {
  switch (cmd) {
    case "setup":
      return SETUP;
    case "sync":
      return SYNC;
    case "review":
      return REVIEW;
    case "init":
      return INIT;
    case "tune":
      return TUNE;
    case "doctor":
      return DOCTOR;
    case "examples":
      return EXAMPLES;
    default:
      return `unknown command ${JSON.stringify(cmd)} (see: jev-pref help)`;
  }
}
