# jev-pref (repo agent notes)

This repo dogfoods `jev-pref` on itself. Canonical config is the root
`jev-pref.json` (mirrored in the fence below); CLI flags > `JEV_*` env >
`jev-pref.json` > this fenced block > built-ins.

```jev-prefs
{
  "$schema": "./packages/jev-pref/schema.json",
  "suites": ["secrets", "prefs"],
  "gateThreshold": 0.7,
  "advisoryThreshold": 0.7,
  "failOn": "gates",
  "prefs": [
    { "id": "no_real_keys", "gate": false, "text": "Docs, comments, and examples must not contain real API keys or tokens." },
    { "id": "skill_layout", "gate": false, "text": "New skills live under skills/<name>/ with SKILL.md carrying name and description frontmatter." },
    { "id": "skill_lean", "gate": false, "text": "SKILL.md bodies stay under ~500 lines with details in references/ (validate-skills warns otherwise)." }
  ]
}
```

## Preference review (Jev)

After every task, and before every commit, run:

  npx jev-pref review

(Pre-commit hook runs `npx jev-pref review --staged`; on PRs use
`npx jev-pref review --pr`. Local dev equivalent:
`node packages/jev-pref/bin/jev-pref.js review`.)

- Exit 1 (gate violated) → fix the flagged prefs and re-run (max 3 times, then escalate to the user).
- Exit 0 with advisory notes → address or explicitly note why not.
- Exit 0 clean → continue.
- Exit 2 (config/infra error: no key, bad ref, missing dep) → fix setup; never treat as approval.
- Never commit the API key; it comes from `JEV_API_KEY`, `TYPESAFE_API_KEY`,
  `AI_GATEWAY_API_KEY`, or `VERCEL_OIDC_TOKEN`.
