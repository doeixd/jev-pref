# jev-pref CLI

Project-defined semantic checks for code changes. You define the conditions or
fixed taxonomies, Jev classifies the evidence, and jev-pref applies policy.

## Setup

Tell your coding agent:

> Run `npx jev-pref setup` to set up code review with jev-pref, then follow the
> instructions it prints.

`setup` is read-only. It inspects repository guidance, shared/local policy,
credential availability, ignore rules, and wiring. It teaches the agent how to
interview the user, author evidence-grounded checks, install a persistent
review-and-synchronization contract, and validate the result.

No global install is needed. Node.js 20+ is required.

## Commands

```bash
npx jev-pref setup
npx jev-pref sync
npx jev-pref review [--diff REF] [--staged] [--pr] [--suites prefs,secrets]
                    [--json] [--dry-run]
                    [--hunks|--no-hunks|--files|--no-files] [--max-hunks N]
                    [--include G] [--exclude G]
                    [--agent-cmd BIN] [--agent-input json|text|none]
                    [--agent-on fix_now] [--agent-timeout-ms MS]
                    [--fail-on gates|all|never]
                    [--gate-threshold N] [--advisory-threshold N]
                    [--config PATH] [--model M] [--base-url U]
                    [--provider typesafe|vercel] [--timeout-ms MS]
                    [--max-diff-chars N]
git diff HEAD~1 | npx jev-pref review --diff - --json
npx jev-pref tune [--sweep] [--check[=N]] [--evals-dir DIR] [--dry-run]
                  [--config PATH]
npx jev-pref doctor [--verbose] [--config PATH]
npx jev-pref examples [agent-loop|pre-commit|github-action|review-script]
```

Exit codes are the stable automation contract:

- `0`: approve/ok, including advisory-only under `failOn: "gates"`
- `1`: the configured failure policy was triggered
- `2`: configuration, infrastructure, or usage error; never approval

## Config precedence

CLI flags > `JEV_*` environment variables > `jev-pref.local.json` >
`jev-pref.json` > a fenced `jev-prefs` block in an agent file > built-ins. File
discovery walks up to the git root. Unknown keys are dropped; `doctor --verbose`
lists them and reports both config paths.

`jev-pref.json` is committed shared policy. `jev-pref.local.json` is personal
policy and should be gitignored. Local preferences merge by id over shared
preferences: matching ids override and new ids append. Other local settings
replace project settings.

| Environment variable | Meaning |
| --- | --- |
| `JEV_API_KEY` | Explicit key override |
| `TYPESAFE_API_KEY`, `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN` | Client authentication cascade |
| `JEV_SUITES` | Comma-separated suite list |
| `JEV_GATE_THRESHOLD`, `JEV_ADVISORY_THRESHOLD` | Probability threshold overrides |
| `JEV_FAIL_ON` | `gates`, `all`, or `never` |
| `JEV_TIMEOUT_MS`, `JEV_MAX_DIFF_CHARS`, `JEV_MODEL`, `JEV_BASE_URL`, `JEV_PROVIDER` | Client settings |
| `JEV_HUNKS`, `JEV_FILES`, `JEV_MAX_HUNKS` | Scoped review settings |
| `JEV_INCLUDE`, `JEV_EXCLUDE` | Comma-separated path filters |
| `JEV_AGENT_TIMEOUT_MS` | Agent handoff timeout |
| `JEV_ZERO_DATA_RETENTION` | Gateway zero-data-retention flag |
| `JEV_CONFIG` | Config path override |

Keys are environment-only and must never be committed.

## Preference shapes

Jev checks must have externally defined answers grounded in the supplied
change. Avoid broad quality questions such as whether code is good, simple,
clean, idiomatic, safe, or sufficiently tested.

A condition produces a probability that the defined condition is true:

```json
{
  "id": "no_swallowed_errors",
  "gate": false,
  "question": "Does this change catch an error and continue without returning, logging, transforming, or explicitly ignoring it?",
  "guidance": "Count only catch/error branches added or changed in this review."
}
```

A choice classifies evidence into project-defined labels. `jev-pref` maps the
selected label to its configured outcome:

```json
{
  "id": "api_impact",
  "type": "choice",
  "question": "Classify the public API impact.",
  "labels": {
    "none": "No exported API changes.",
    "additive": "Only backwards-compatible additions.",
    "breaking": "An existing export is removed, renamed, or incompatible."
  },
  "outcomes": {
    "none": "approve",
    "additive": "approve",
    "breaking": "fix_now"
  }
}
```

Legacy `{ "gate", "text" }` conditions remain accepted, but `question` plus
optional `guidance` is the preferred authoring form.

## Suites and granularity

- `prefs` evaluates the merged shared and personal preferences.
- `secrets` is a built-in gate for leaked credentials and personal data.

Jev accepts at most 30k input tokens, including state and questions. Whole-diff
review therefore uses a conservative 20,000-character diff budget and fails
loudly when the complete diff does not fit. It never treats a truncated prefix
as approval.

`--hunks` makes one bounded call per hunk/new file with file:line attribution.
`--files` makes one bounded call per changed file. Oversized units are split
into parts. `--max-hunks` is the backward-compatible cap for all scoped calls;
if the cap is exceeded, review exits 2 and asks you to review a smaller change,
use `--include`/`--exclude`, or intentionally raise the cap. Scoped review never
falls back to one oversized request.

## Agent handoff

The optional `agent` config sends selected verdicts to another process:

```json
{
  "agent": {
    "command": ["claude", "-p", "Fix these review findings: {verdict}"],
    "input": "json",
    "on": ["fix_now"],
    "timeoutMs": 300000
  }
}
```

The command is an argv array and never a shell string. Supported placeholders
are `{verdict}`, `{json}`, `{files}`, and `{outcome}`. Standard input carries
the full payload. Handoff failure exits 2.

## Programmatic use

Use the CLI as a subprocess:

```bash
npx jev-pref review --json
```

The JSON verdict plus exit status is the programmatic interface. Run
`npx jev-pref examples review-script` for a Node.js wrapper. Other recipes cover
the recommended agent loop, pre-commit, and GitHub Actions.

## Calibration

Condition evals use booleans; choice evals use one of the configured labels:

```json
{ "name": "example", "diff": "...", "expected": { "condition_id": true, "choice_id": "breaking" } }
```

`tune --sweep` reports accuracy by threshold and proposes a config diff.
`tune --check` (or `--check=0.8`) fails when accuracy is below the chosen bar.

## Client

The CLI uses [`advocaat`](https://github.com/pithings/advocaat) for direct,
Gateway, and OIDC authentication. It adds retry/backoff, timeouts, diff
collection, typed verdict rendering, and the exit-code contract.
