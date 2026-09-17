# Wiring triggers (one engine, many triggers)

All triggers invoke the same binary with the same exit contract
(0 approve — advisory too, unless `--fail-on all`; 1 gate failure;
2 infra error — never treat 2 as approval).

## Agent instruction file

Append, adapting bracketed parts to the interview answers. Keep the fenced
config and the run instruction together: `init` writes both as one block —
the fence is the machine config, the run block is the human instruction.
On conflict `jev-pref.json` wins, so re-run `init --print` (or hand-edit)
rather than letting a stale fence mislead.

```markdown
## Preference review (Jev)

After [every task / before every commit / on every PR] run:

  npx jev-pref review [--staged] [--pr]

- Exit 1 (gate violated) → fix the flagged prefs and re-run (max 3 times, then escalate).
- Exit 0 with advisory notes → address or explicitly note why not.
- Exit 0 clean → continue.
- Exit 2 (config/infra error) → fix setup; never treat as approval.
- Keys come from the environment; never commit them.
```

## Git hooks

Pre-commit (staged only) and pre-push examples:

```bash
# .git/hooks/pre-commit
npx jev-pref review --staged || exit 1
```

Pin a version in shared setups: `npx jev-pref@0.1.0 review --staged`.
Pre-publish (or for a monorepo pin), call the local binary instead:
`node ./packages/jev-pref/bin/jev-pref.js review --staged`.

Scope notes: `--staged` / `--diff` / `--pr` judge exactly that scope —
untracked files are included only in default working-tree reviews. Use
`--include` / `--exclude` globs to narrow any scope to the paths you care
about.

## Agent hooks

A markdown instruction is advisory — agents skip it under pressure. If the
harness supports enforcement hooks (e.g. Claude Code `PostToolUse` on edit/commit
commands), call `npx jev-pref review` there too and keep the markdown block as
the human-readable record.

## CI

Use `doeixd/jev-pref/actions/review` (see `actions/review/README.md`):
PR diffs via the base...head range, sticky summary comment + file
annotations, check failed iff gates fail (see `fail-on`). Needs checkout
with `fetch-depth: 0` and `TYPESAFE_API_KEY` in secrets. Start new repos on
the `advisory.yml` example, switch to `strict.yml` once calibrated.

## Agent handoff

To auto-fix or escalate instead of just reporting, configure the engine's
`agent` block (argv array only — never a shell string; verdict via stdin):

```json
{
  "agent": {
    "command": ["claude", "-p", "Fix these review findings: {verdict}"],
    "input": "json",
    "on": ["fix_now"]
  }
}
```

Ask the user for: the command (bin + fixed args), what it receives (`json`
full payload / `text` summary / `none`), and which outcomes trigger it.
Placeholders in args are replaced literally: `{verdict} {json} {files}`
`{outcome}` (`{json}` omits the diff — argv has OS limits; stdin carries the
full payload). Agent failures exit 2 (`agent-error`), never silent.

## Rules

- Reference the real command (with flags), not a placeholder.
- State the trigger in the user's own words from the interview.
- If both `CLAUDE.md` and `AGENTS.md` exist, ask which is canonical; mirror a
  one-line pointer in the other rather than duplicating the block.
