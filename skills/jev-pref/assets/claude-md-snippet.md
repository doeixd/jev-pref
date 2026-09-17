## Preference review (Jev)

After [every task / before every commit / on every PR] run:

  npx jev-pref review [--staged] [--pr] [--hunks]

- Exit 1 (gate violated) → fix the flagged prefs and re-run (max 3 times, then escalate to the user).
- Exit 0 with advisory notes → address or explicitly note why not.
- Exit 0 clean → continue.
- Exit 2 (config/infra error: no key, bad ref, missing dep) → fix setup; never treat as approval.
- Never commit the API key; it comes from `JEV_API_KEY`, `TYPESAFE_API_KEY`,
  `AI_GATEWAY_API_KEY`, or `VERCEL_OIDC_TOKEN`.

Prefs live in `jev-pref.json` (or the ` ```jev-prefs ` fenced block); see the
`jev-pref` skill for the setup interview, threshold tuning (`tune`), and
agent handoff / per-hunk options.
