# jev-pref

Turn your `CLAUDE.md` / `AGENTS.md` preferences into a reviewer that actually
runs: [Jev](https://docs.typesafe.ai) (TypeSafe's evaluation model) judges
every diff against your prefs — gates fail the build, advisories note nits,
secrets never slip through. One setup, enforced everywhere: agent sessions,
git hooks, and PR checks all call the same binary with the same exit contract
(`0` approve, `1` gate violated, `2` setup error — never treat 2 as approval).

Agent skills installable with [skills.sh](https://skills.sh) via the [`skills` CLI](https://github.com/vercel-labs/skills).

[![skills.sh](https://skills.sh/b/doeixd/jev-pref)](https://skills.sh/doeixd/jev-pref)

## Quickstart (60 seconds)

```bash
# 1. Sanity check (node >= 20, git, keys, config)
npx jev-pref doctor

# 2. Interview-to-config: writes jev-pref.json + wires the run instruction
#    into CLAUDE.md / AGENTS.md
npx jev-pref init

# 3. Add your prefs, then review (free preview first, live after)
npx jev-pref review --dry-run
npx jev-pref review --staged     # pre-commit  ·  --pr for PRs  ·  --hunks for per-hunk verdicts

# 4. Calibrate later against real verdicts
npx jev-pref tune --sweep
```

Keys are env-only (`JEV_API_KEY`, else `TYPESAFE_API_KEY` →
`AI_GATEWAY_API_KEY` → `VERCEL_OIDC_TOKEN`) — never committed. Full command
reference is in the [engine README](./packages/jev-pref/).

## Install

```bash
# List available skills without installing
npx skills add doeixd/jev-pref --list

# Install one skill (project scope, default)
npx skills add doeixd/jev-pref --skill jev-pref

# Install globally (available across all projects)
npx skills add doeixd/jev-pref --skill jev-pref -g -y

# Install everything from this repo
npx skills add doeixd/jev-pref --all
```

For local testing:

```bash
npx skills add ./ --list
npx skills add ./ --skill jev-pref
```

Test a skill without installing:

```bash
npx skills use ./jev-pref --skill jev-pref | claude
```

## Skills

| Skill | Description |
| ----- | ----------- |
| [jev-pref](./skills/jev-pref/SKILL.md) | Set up Jev as a durable user-preference code reviewer via the `jev-pref` engine. |

## Engine (`npx jev-pref`)

The [`jev-pref` npm package](./packages/jev-pref/) implements the reviewer:
`review` / `init` / `tune` / `doctor` (see its README for flags, config
precedence, per-hunk review, and agent handoff). The skill teaches setup;
the engine does the work — update logic once, every installation improves.

Prefer piping? `git diff HEAD~1 | npx jev-pref review --diff -` reviews any
diff with no repo required; `--json` keeps stdout machine-readable for
composition with other tools.

## GitHub Action

[`actions/review`](./actions/review/) reviews PRs: sticky summary comment
with `[file:line]` attribution, file annotations, outcome-driven check status
(`examples/` has strict, advisory, and nightly-tune workflows). Start new
repos on advisory (`fail-on: never`), go strict once `tune` confirms.
This repo dogfoods it on PRs to master (see
`.github/workflows/jev-review.yml`) with the root `jev-pref.json`.

## Development

```bash
node scripts/validate-skills.mjs   # skill frontmatter + layout
npm test --prefix packages/jev-pref  # engine unit suites (node:test)
node packages/jev-pref/bin/jev-pref.js doctor  # env sanity (needs no key to run)
```

CI (`.github/workflows/validate.yml`) runs all three plus `tune --dry-run`
on every push/PR. Live engine checks need a key (`TYPESAFE_API_KEY` in env
locally, repo secret in CI) — dry-runs are always free.

## Repo layout

Skills are discovered by the `skills` CLI in `skills/` (up to 3 levels deep, so
`skills/<name>/SKILL.md` and `skills/<category>/<name>/SKILL.md` both work).
Each skill is a directory with at minimum a `SKILL.md` containing `name` and
`description` frontmatter — see the [Agent Skills spec](https://agentskills.io/specification).

```
jev-pref/
├── README.md
├── LICENSE
├── .env.example             # key names for local runs (never commit .env)
├── skills/                    # <-- installable skills live here
│   └── jev-pref/
│       ├── SKILL.md           # required: name + description + instructions
│       ├── references/        # jev-essentials, prefs-to-questions, interview, wiring, effect-stack, ci-setup
│       └── assets/            # review-script-template.mjs + effect.ts + CLAUDE.md snippet
├── packages/
│   └── jev-pref/              # <-- npm engine: npx jev-pref review|init|tune|doctor
│       ├── src/               # cli, commands, suites, git/hunks/agent/jev plumbing
│       ├── test/              # node:test unit suites (npm test)
│       └── evals/             # sample labeled cases for tune
├── actions/
│   └── review/                # <-- reusable GitHub Action + examples
├── templates/
│   └── skill-template/        # starter copy-paste template (not installed)
│       └── SKILL.md
├── scripts/
│   └── validate-skills.mjs    # checks frontmatter + layout
└── .github/workflows/
    ├── validate.yml           # skills check + engine tests + doctor + tune dry-run
    └── jev-review.yml         # dogfood: PR review on master
```

## Add a new skill

```bash
# Option A: use the CLI template
npx skills init skills/my-skill

# Option B: copy the bundled template
cp -r templates/skill-template skills/my-skill
```

Then edit `skills/my-skill/SKILL.md`:

1. Set `name` (lowercase, hyphens, must match directory name) and `description`
   (what it does + when to use it — this is the trigger).
2. Keep the body under ~500 lines. Put details in `references/`, executable code
   in `scripts/`, templates in `assets/`.
3. Validate and list locally before pushing:

```bash
node scripts/validate-skills.mjs
npx skills add ./ --list
```

## API keys and environment

No PATH changes needed — just Node 20+ and `npx`. The engine reads keys from
the environment only (never committed), in this order:

1. `JEV_API_KEY` — explicit override, wins over everything.
2. `TYPESAFE_API_KEY` — direct TypeSafe path (model `jev-latest`).
3. `AI_GATEWAY_API_KEY` — Vercel AI Gateway (model `typesafe-ai/jev`).
4. `VERCEL_OIDC_TOKEN` — Gateway via OIDC on Vercel deployments.

Copy `.env.example` to `.env` for local runs (loaded by your shell, never by
the script — the script reads `process.env` directly).

## Validation

```bash
node scripts/validate-skills.mjs     # skill frontmatter + layout
npm test --prefix packages/jev-pref  # engine unit suites
```

See [Development](#development) for the full loop. CI
(`.github/workflows/validate.yml`) runs these plus `doctor` and
`tune --dry-run` on every push/PR.

## skills.sh

Published as [`doeixd/jev-pref`](https://skills.sh/doeixd/jev-pref).
Install counts appear there automatically as people run
`npx skills add doeixd/jev-pref`. No registry submission needed.

## License

MIT — see [LICENSE](./LICENSE).
