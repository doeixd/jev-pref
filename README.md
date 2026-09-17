# jev-pref

Agent skills installable with [skills.sh](https://skills.sh) via the [`skills` CLI](https://github.com/vercel-labs/skills).

[![skills.sh](https://skills.sh/b/doeixd/jev-pref)](https://skills.sh/doeixd/jev-pref)

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
| [jev-pref](./skills/jev-pref/SKILL.md) | Set up Jev as a durable user-preference code reviewer (script + CLAUDE.md wiring). |

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
│       ├── references/        # jev-essentials, prefs-to-questions, interview, wiring
│       └── assets/            # review-script-template.mjs + CLAUDE.md snippet
├── templates/
│   └── skill-template/        # starter copy-paste template (not installed)
│       └── SKILL.md
├── scripts/
│   └── validate-skills.mjs    # checks frontmatter + layout
└── .github/workflows/
    └── validate.yml
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

No PATH changes needed — just Node 20+ and `npx`. The generated review script
reads keys from the environment only (never committed):

| Variable | Used when | Get it |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | Default path (Vercel AI Gateway, model `typesafe-ai/jev`) | `npx vercel ai-gateway setup` |
| `TYPESAFE_API_KEY` | Fallback direct path (model `jev-latest`) | https://console.typesafe.ai |

Copy `.env.example` to `.env` for local runs (loaded by your shell, never by
the script — the script reads `process.env` directly). The template picks
Gateway when `AI_GATEWAY_API_KEY` is set, otherwise direct when
`TYPESAFE_API_KEY` is set, otherwise exits 2 with a setup error.

## Validation

```bash
node scripts/validate-skills.mjs
```

CI (`.github/workflows/validate.yml`) runs the same check on every push/PR.

## skills.sh

Published as [`doeixd/jev-pref`](https://skills.sh/doeixd/jev-pref).
Install counts appear there automatically as people run
`npx skills add doeixd/jev-pref`. No registry submission needed.

## License

MIT — see [LICENSE](./LICENSE).
