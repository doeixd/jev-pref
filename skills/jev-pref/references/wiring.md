# Wiring triggers (one engine, many triggers)

All triggers invoke the same binary with the same exit contract
(0 approve/advisory, 1 gate failure, 2 infra error — never treat 2 as approval).

## Agent instruction file

Append, adapting bracketed parts to the interview answers:

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

## Agent hooks

A markdown instruction is advisory — agents skip it under pressure. If the
harness supports enforcement hooks (e.g. Claude Code `PostToolUse` on edit/commit
commands), call `npx jev-pref review` there too and keep the markdown block as
the human-readable record.

## CI

See `actions/review` (phase 3): PR diffs via `--pr`, inline + summary comments,
check status failed iff gates fail.

## Rules

- Reference the real command (with flags), not a placeholder.
- State the trigger in the user's own words from the interview.
- If both `CLAUDE.md` and `AGENTS.md` exist, ask which is canonical; mirror a
  one-line pointer in the other rather than duplicating the block.
