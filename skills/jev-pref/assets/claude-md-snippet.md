## Preference review (Jev)

After [every task / before every commit / on every PR] run:

  node scripts/jev-review.mjs [--diff <ref>]

- Exit 1 (gate violated) → fix the flagged prefs and re-run (max 3 times, then escalate to the user).
- Exit 0 with advisory notes → address or explicitly note why not.
- Exit 0 clean → continue.
- Exit 2 (config/infra error: no key, bad ref, missing dep) → fix setup; never treat as approval.
- Never commit the API key; it comes from `AI_GATEWAY_API_KEY` or `TYPESAFE_API_KEY`.
