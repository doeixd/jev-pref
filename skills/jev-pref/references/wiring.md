# Wiring CLAUDE.md / AGENTS.md

Append an entry naming the exact script path, trigger, and verdict handling.
Adapt the bracketed parts to the interview answers.

```markdown
## Preference review (Jev)

After [every task / before every commit / on every PR] run:

  node scripts/jev-review.mjs [--diff <ref>]

- Exit 1 (gate violated) → fix the flagged prefs and re-run (max 3 times, then escalate).
- Exit 0 with advisory notes → address or explicitly note why not.
- Exit 0 clean → continue.
- Exit 2 (config/infra error) → fix setup; never treat as approval.
- Never commit the API key; it comes from `AI_GATEWAY_API_KEY` or `TYPESAFE_API_KEY`.
```

Rules:

- Reference the script by its real relative path, not a placeholder.
- State the trigger in the user's own words from the interview.
- If both `CLAUDE.md` and `AGENTS.md` exist, ask which is canonical; mirror a
  one-line pointer in the other rather than duplicating the block.
