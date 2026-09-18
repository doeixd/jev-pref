# jev-pref

**Turn your AGENTS.md preferences into a fast, Jev-powered AI linter.**

`jev-pref` lets you define project-specific semantic rules, run them against
code changes with [Jev](https://docs.typesafe.ai), and feed the results back to
your coding agent.

## Quick start

Tell your coding agent:

```text
Run `npx jev-pref setup` and follow the instructions it prints.
```

That's it.

`setup` inspects the repository and teaches the agent how to configure
`jev-pref`. The agent explains the system, asks you a few questions, helps
translate your preferences into useful semantic checks, and adds persistent
instructions to `AGENTS.md`, `CLAUDE.md`, or wherever you choose.

No special agent integration or global installation is required. Node.js 20+
and `npx` are enough.

## How to think about it

Think:

```text
TypeScript  → type invariants
ESLint      → syntax and static rules
tests       → behavioral invariants
jev-pref    → semantic project rules
```

Instead of asking an AI:

> Is this code good?

you define what matters:

> Does this change introduce shared mutable state?

> Does this change add a second representation of an existing domain concept?

> Does this public API remove or rename an existing export?

> Classify this API change as none, additive, behavioral, or breaking.

Jev evaluates those questions against the change. `jev-pref` applies
project-defined thresholds and outcomes to produce structured findings. Your
coding agent can use those findings to improve the implementation.

## What it looks like

A normal agent workflow might be:

```text
You:
"Add support for custom transports."

        ↓

Coding agent implements it.

        ↓

Agent:
"I've finished a substantial bout of work.
Running the project semantic checks."

        ↓

npx jev-pref review --hunks

        ↓

jev-pref:
advisory

[packages/core/src/transport.ts:42]
new_parallel_abstraction
P=0.91

This change introduces a new transport abstraction
alongside the project's existing Transport service.

        ↓

Agent reads the finding, inspects the repository,
and decides how to improve the implementation.

        ↓

Agent refactors the change.

        ↓

npx jev-pref review --hunks

        ↓

approve
```

`jev-pref` is the **linter**.

Your coding agent is the **fixer**.

## Why?

Coding agents are good at building things. They can also drift from project
conventions while they work:

- introducing a second abstraction for something that already exists;
- widening an API beyond the project's defined policy;
- adding configuration where the project requires an existing composition
  mechanism;
- creating shared state where the architecture forbids it;
- changing a public API in a way the project defines as breaking;
- crossing project-specific architectural boundaries.

Many of these rules are difficult or impractical to encode in ESLint,
TypeScript, or ordinary static analysis. They can still be concrete enough to
evaluate from a code change.

```text
                  deterministic tooling

formatter ─────── formatting
TypeScript ────── types
ESLint ────────── static rules
tests ─────────── behavior

                       │
                       ▼

jev-pref ─────── semantic project rules

                       │
                       ▼

                 coding agent
                 fixes findings
```

## The important constraint

Jev is not a general-purpose senior code reviewer. It works best when **you
define what counts** and the evidence needed to answer is present in the input.

Good questions look like:

```text
Does this diff introduce new mutable module-level state?
```

```text
Does this change remove or rename an existing exported symbol?
```

```text
Does this diff introduce another representation of a concept already
represented by the project's Surface abstraction?
```

```text
Classify the API impact:

- none
- additive
- behavioral
- breaking
```

Poor questions look like:

```text
Is this good architecture?
```

```text
Is this code clean?
```

```text
Are these tests sufficient?
```

```text
Is this implementation unnecessarily complicated?
```

Those require the evaluator to invent its own standard of quality. `jev-pref`
uses a different contract:

```text
YOU define the rule.
JEV classifies the evidence.
JEV-PREF determines the outcome.
YOUR AGENT acts on the result.
```

## Setup

Run:

```bash
npx jev-pref setup
```

`setup` is intentionally agent-facing. It does not run a rigid CLI questionnaire
or make subjective configuration decisions itself. Instead, it:

1. inspects the repository;
2. finds existing `AGENTS.md`, `CLAUDE.md`, conventions, and config;
3. explains `jev-pref` to the coding agent;
4. tells the agent what questions to ask you;
5. teaches the agent how to write evidence-grounded checks;
6. explains available integration options;
7. provides configuration examples and verification steps.

The coding agent then talks to you, understands your answers, and edits the
project appropriately.

### The agent translates; Jev evaluates

The coding agent is responsible for translating the project's human guidance
into Jev-shaped checks. It reads `AGENTS.md`, `CLAUDE.md`, and related
conventions, asks you to define any missing criteria, and writes the resulting
questions or fixed classifications to the Jev configuration. It should not
send vague instructions such as “keep the code clean” to Jev.

Jev is the evaluator, not the policy author or fixer. For each bounded diff it
classifies the evidence against those configured questions, returning a
probability for a condition or a label and confidence for a choice. `jev-pref`
then applies your thresholds and outcome mapping (`approve`, `advisory`, or
`fix_now`). The agent reads that result, explains it, and decides how to change
the code.

Because Jev's input limit is 30k tokens including state and questions, the
agent should review focused changes: use `--hunks` for small file/line scopes,
`--files` for bounded files, and narrow larger work with `--include` or
`--exclude`.

```text
Human + agent
    ↓
interpret intent
shape preferences
edit project files

jev-pref
    ↓
repeatable evaluation
structured output
stable exit behavior
```

## What setup will ask you

The exact conversation depends on the repository, but the agent establishes
five things.

### 1. What should be checked?

The agent inspects existing project guidance and identifies candidate semantic
rules. It then classifies each candidate:

```text
DIRECT
The answer is externally defined and visible in the review input.

NEEDS SHAPING
The intent is useful, but its terms lack observable criteria.

NOT FOR JEV
The rule is procedural, needs unavailable evidence, asks for subjective
quality judgment, or deterministic tooling can enforce it better.
```

Only DIRECT candidates should become Jev checks. Fewer well-defined checks are
better than broad subjective coverage.

For example, this guidance is useful but too broad by itself:

```text
"Public primitives should compose with existing primitives rather than
introduce parallel systems."
```

The agent can help turn it into one or more concrete questions, such as:

```text
Does this change introduce a new public abstraction representing a concept
already represented by the project's Surface primitive?
```

### 2. Is each result blocking or advisory?

A **gate** means the project generally should not continue when a defined
condition is detected. Gates suit architectural invariants, prohibited
patterns, breaking API changes, security-sensitive policies, and rules that are
substantially harder to repair later.

An **advisory** surfaces a defined condition without automatically blocking
progress. When policy severity is uncertain, start advisory and tighten it
after observing labeled examples.

Fixed classifications can map each label separately:

```text
none        → approve
additive    → approve
behavioral  → advisory
breaking    → fix_now
```

### 3. Are the preferences shared or personal?

Shared project rules belong in committed configuration:

```text
jev-pref.json
```

Personal or experimental rules belong in:

```text
jev-pref.local.json
```

The local file should normally be gitignored. It merges over shared policy by
preference id: matching ids override shared checks and new ids append. Other
local settings override their shared equivalents.

The agent asks before changing `.gitignore` or deciding policy ownership.

### 4. When should review run?

There are several integration styles.

#### Agent loop — recommended

Tell the coding agent to run `jev-pref` after a meaningful bout of work, while
the diff is still focused.

```text
implement
   ↓
jev-pref review --hunks
   ↓
fix findings
   ↓
continue
```

#### GitHub Actions

Run the same checks on pull requests for shared policy and merge enforcement.

#### Git hooks

Run file-scoped checks on staged changes before committing.

#### Custom scripts

Consume JSON and exit codes from Node, Python, shell scripts, CI systems,
editors, or custom agent infrastructure:

```bash
npx jev-pref review --json
```

### 5. How should Jev authenticate?

Credentials are environment-only. Supported sources include:

```text
JEV_API_KEY
TYPESAFE_API_KEY
AI_GATEWAY_API_KEY
VERCEL_OIDC_TOKEN
```

The setup agent inspects which authentication paths appear available and asks
which one the project should rely on. Keys must never be written to config,
agent instructions, scripts, or committed environment files. Persistent
instructions may document the environment variable name, never its value.

## Writing good semantic checks

A good Jev check has an answer whose meaning is defined outside the model.

A useful test is:

> Could I explain exactly what visible evidence would make this rule true?

If not, the rule needs more shaping.

### Prefer concrete conditions

Instead of:

```text
Keep code simple.
```

define what unwanted complexity means in this project:

```text
Does this change introduce a new abstraction layer that only forwards calls
to one existing implementation without adding a policy boundary,
representation change, lifecycle boundary, or implementation choice?
```

Instead of:

```text
Don't break APIs.
```

use:

```text
Does this change remove, rename, or add required arguments to an existing
public export without preserving a compatible path?
```

Instead of `Use Effect idiomatically`, define and split the actual Effect
conventions the project follows.

### One judgment per check

Avoid combining properties that can disagree:

```text
Is this code simple, type-safe, composable, well-tested, and idiomatic?
```

A condition should usually represent one semantic predicate.

### Fixed classifications are powerful

Not every check needs to be yes/no. Jev can classify a change into fixed labels
defined by the project, and `jev-pref` can map those labels to consequences.

```text
Jev:      public API impact = behavioral, P=0.86, confidence=0.73
Policy:   behavioral → advisory
Result:   advisory
```

Write Bernoulli questions, not true/false ones. A condition asks Jev to
estimate p(true) from visible evidence (Jev native type `noul`, answered
`{chance: P}`); the threshold is the decision boundary on p. Name the visible
fact that moves p in `guidance` ("count only ...") rather than restating truth
conditions.

Classification confidence and policy severity stay separate. Thresholds gate
on probability (P) only; confidence is displayed (for example
`P=0.86 confidence=0.73`) but never gates, suppresses, or applies an outcome.
An important gate does not block unless its probability crosses the configured
gate threshold; a high-confidence advisory remains non-blocking.
`gateThreshold` governs gate conditions, secrets, AND `fix_now`-mapped choice
labels; `advisoryThreshold` governs advisory conditions and advisory-mapped
labels (a `fix_now` label between the two reports an uncertain-gate note). A
choice whose top label scores below its outcome's cutoff falls through to
approve for that scope — no failure, no note, no fallback to the next label —
while the classification line is still printed.

### Don't replace deterministic tooling

If existing tooling can enforce a rule reliably, use it:

```text
Prettier        → formatting
ESLint          → syntax and static patterns
TypeScript      → types
tests           → behavior
secret scanner  → known credential formats
```

Use `jev-pref` where semantic interpretation is useful and the project still
defines the answer.

## Keeping guidance and checks synchronized

`AGENTS.md`, `CLAUDE.md`, architecture docs, and Jev configuration should not
quietly drift apart. During setup, the agent can add a persistent rule like:

```md
## Jev preference synchronization

Whenever agent instructions, architectural guidance, coding conventions, or
similar project policy changes:

1. Review the current Jev checks.
2. Determine whether the guidance adds, removes, or changes an externally
   defined condition Jev should evaluate.
3. Update Jev checks when appropriate.
4. Do not mechanically translate every instruction.
5. Prefer concrete conditions or fixed classifications over broad quality
   judgments.
6. Leave deterministic rules to tests, types, linters, or static analysis.
7. Ask the user when the intended translation is ambiguous.

When changing Jev checks directly, verify that human-readable project guidance
still reflects the intended policy.
```

Run the read-only synchronization protocol with:

```bash
npx jev-pref sync
```

It tells the agent how to reconcile project documentation and executable
semantic checks. It does not change policy itself.

## Commands

### `jev-pref setup`

```bash
npx jev-pref setup
```

Agent-facing onboarding. It inspects the repository and teaches the agent how
to configure `jev-pref` with the user.

### `jev-pref review`

```bash
npx jev-pref review
```

Review the current working changes. Common scopes:

```bash
npx jev-pref review --staged
npx jev-pref review --pr
npx jev-pref review --diff HEAD~1
git diff HEAD~1 | npx jev-pref review --diff -
```

Use per-hunk review for focused agent work and file/line attribution:

```bash
npx jev-pref review --hunks
```

Use per-file review for broader changes and pull requests:

```bash
npx jev-pref review --files
```

Jev accepts at most 30k input tokens, including the review state and questions.
`jev-pref` uses a conservative per-request diff budget, splits bounded file or
hunk scopes when necessary, and fails loudly rather than approving truncated or
incomplete input. Review changes while they are still small, or narrow them
with `--include` and `--exclude`.

#### What Jev sees per call (the evidence envelope)

Each Jev call receives exactly the serialized `{state, questions}` pair that
`--dry-run` prints — nothing else. `state` carries the call's pref subset,
the `diff` body (one hunk/file, or the whole diff for change-scoped and
whole-diff calls), `hunk {file, label, header}` (`--hunks`), `changed_file`
(`--files`), or `new_file` (untracked), plus `untracked_files`, `git_status`,
`diff_stat`, `context`, and a completeness note. Filenames ARE visible via
diff/hunk headers and the file/label fields; the rest of the repo is NOT.
Write guidance against that envelope.

#### Cost model

Calls are sequential: one Jev call per hunk/file scope, plus one whole-diff
call when any pref is `change`-scoped. 10 hunks ~= 10 calls. Prefer `--files`
for broad reviews (one call per file) and narrow with `--include`/`--exclude`
before raising `--max-hunks`.

Preview the planned questions and state without a live call:

```bash
npx jev-pref review --dry-run
```

Produce machine-readable output:

```bash
npx jev-pref review --json
```

### `jev-pref sync`

```bash
npx jev-pref sync
```

Agent-facing maintenance guidance for reconciling project policy and Jev
checks after meaningful guidance or configuration changes. Read-only: it reads
guidance files, both config layers, and git ignore state, then prints the
reconciliation protocol (classification, scope check, verify step) for the
agent to follow. It writes nothing and decides no policy.

### `jev-pref tune`

```bash
npx jev-pref tune
```

Calibrate checks against labeled examples in `evals/*.json`, each
`{name, diff, expected}` with `expected` mapping pref id to `true`/`false`
(conditions) or a label string (choices). One Jev call per case, then
`accuracy @ gateThreshold`: conditions compare `(P >= threshold)` vs expected,
choices compare the selected label vs expected (threshold-independent).
`--sweep` re-scores the frozen answers over 0.5..0.9 and proposes a
`gateThreshold` diff (nothing is written); `--check` fails below a bar.
"Calibrated" means highest accuracy on your labels.

```bash
npx jev-pref tune --sweep
npx jev-pref tune --check=0.8
```

### `jev-pref doctor`

```bash
npx jev-pref doctor
npx jev-pref doctor --verbose
```

Checks runtime support, configuration and discovery, authentication presence,
supported suites, and invalid or ignored keys.

### `jev-pref examples`

```bash
npx jev-pref examples
npx jev-pref examples agent-loop
npx jev-pref examples pre-commit
npx jev-pref examples github-action
npx jev-pref examples review-script
```

Prints copyable integration recipes without writing them into the repository.

## Configuration

A shared project config might contain a condition and a fixed classification:

```json
{
  "$schema": "https://raw.githubusercontent.com/doeixd/jev-pref/v0.3.0/packages/jev-pref/schema.json",
  "suites": ["prefs"],
  "gateThreshold": 0.8,
  "advisoryThreshold": 0.7,
  "failOn": "gates",
  "prefs": [
    {
      "id": "shared_mutable_state",
      "scope": "hunk",
      "gate": true,
      "question": "Does this change introduce new mutable state shared across module or application boundaries?",
      "guidance": "Local variables and state scoped to one object instance do not count."
    },
    {
      "id": "public_api_change",
      "type": "choice",
      "question": "Classify the public API impact introduced by this change.",
      "labels": {
        "none": "No exported API changes.",
        "additive": "Only backwards-compatible additions.",
        "behavioral": "Existing API remains callable but observable behavior changes.",
        "breaking": "An existing export is removed, renamed, or requires incompatible usage."
      },
      "outcomes": {
        "none": "approve",
        "additive": "approve",
        "behavioral": "advisory",
        "breaking": "fix_now"
      }
    }
  ]
}
```

Legacy `{ "gate", "text" }` conditions remain accepted, but `question` with
optional `guidance` is the preferred form.

Prefs accept `scope: "hunk"` (default, evaluated per hunk/file scope) or
`scope: "change"` (evaluated once against the whole diff). Use `change` for
whole-diff predicates such as "does this change modify AGENTS.md?" so the
question does not fire on every unrelated hunk.

Condition questions display as `condition` in dry-run output (the Jev wire
type is `noul`). Pin `$schema` to a tagged release URL, not `master`, so old
configs validate against what they were written for.

Shared policy lives in `jev-pref.json`. Optional personal additions and same-id
overrides live in gitignored `jev-pref.local.json`.

## Outcomes and exit codes

`jev-pref` reduces evaluator results to three outcomes:

```text
approve                  no configured check crossed its threshold
approve with N advisories  clean exit under failOn=gates, but N advisories fired
advisory (N advisories)    a non-blocking condition or label was detected
fix_now                  a blocking condition or label was detected
```

JSON carries `advisoryCount` alongside `outcome` so scripts can distinguish
advisory-only passes from clean approvals without parsing text. Scoped JSON
uses the canonical `scopes` array (no duplicated `hunks` array).

The stable process contract is:

```text
0  accepted under the configured failOn policy
1  the configured failOn policy was triggered
2  configuration, infrastructure, or usage failure
```

Exit code 2 is never approval. Agents should normally fix blocking findings and
rerun, with at most three automatic review/fix iterations before asking the
user how to proceed.

## Agent integration

The recommended integration is deliberately simple. Put something like this in
`AGENTS.md` or `CLAUDE.md`:

```md
## Semantic review

After a substantial bout of implementation work, run:

    npx jev-pref review --hunks

Use the findings as an independent semantic check against project-defined
preferences.

- `fix_now`: address the finding and rerun the review.
- `advisory`: consider the finding in context.
- `approve`: continue.
- infrastructure or configuration errors are not approval.

Perform at most 3 automatic review/fix loops before asking the user.
Whenever project-policy guidance changes, run `npx jev-pref sync` and reconcile
the guidance with the project's Jev checks.
```

The agent already understands the codebase and knows how to edit it. `jev-pref`
gives it another source of focused, independently generated information.

## GitHub Actions

The optional [review Action](./actions/review/) runs the same evaluator on pull
requests, adds a sticky summary and annotations, and maps the verdict to check
status. It defaults to bounded per-file requests.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: doeixd/jev-pref/actions/review@master
  with:
    api-key: ${{ secrets.TYPESAFE_API_KEY }}
    fail-on: gates
```

Teams can start advisory and make selected rules blocking after calibrating
them on real changes.

## Custom scripting

`jev-pref` is a normal command-line primitive:

```bash
npx jev-pref review --json
```

Conceptually:

```js
const result = await run("npx", ["jev-pref", "review", "--json"])
const review = JSON.parse(result.stdout)

if (review.outcome === "fix_now") {
  // ask an agent to fix it
  // block a deployment
  // create a ticket
  // send a notification
}
```

The interface is structured JSON plus a stable exit code, rather than a
JavaScript library API.

## Agent skill

The optional [`jev-pref` skill](./skills/jev-pref/SKILL.md) is intentionally
thin. Its job is discovery: run `npx jev-pref setup` and follow the instructions
printed by the authoritative CLI protocol.

```bash
npx skills add doeixd/jev-pref --skill jev-pref
```

## Architecture

```text
                 HUMAN / PROJECT
                       │
                       ▼
             explicit semantic rules
                       │
                       ▼
                 jev-pref config
                       │
                       ▼
                    git diff
                       │
                       ▼
                ┌────────────┐
                │    Jev     │
                │ classifier │
                └─────┬──────┘
                      │
             typed answers + confidence
                      │
                      ▼
             deterministic policy
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       approve     advisory    fix_now
          │           │           │
          └───────────┼───────────┘
                      ▼
                 coding agent
                      │
                      ▼
                  improved code
```

The evaluator does not own your definition of quality. The project does.

## Philosophy

A useful semantic check should generally be:

- **Externally defined:** the project or user determines what counts.
- **Evidence-grounded:** the answer follows from information supplied to Jev.
- **Narrow:** one check represents one meaningful judgment.
- **Actionable:** a finding gives the coding agent information it can use.
- **Calibratable:** labeled examples reveal whether the check works.
- **Complementary:** deterministic tooling does not already enforce it well.

If a check depends mostly on the evaluator's own sense of what is elegant,
safe, clean, or good, it is not ready to become a Jev check.

## The short version

```text
Define the rules static tooling can't express.

Let Jev classify whether your changes match them.

Let your coding agent use those findings to improve the project.
```

```bash
npx jev-pref setup
```

Then let your agent take it from there.
