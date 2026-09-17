
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

After every task, run:

  npx jev-pref review

- Exit 1 (gate violated) → fix the flagged prefs and re-run (max 3 times, then escalate).
- Exit 0 with advisory notes → address or explicitly note why not.
- Exit 0 clean → continue.
- Exit 2 (config/infra error) → fix setup; never treat as approval.
- Keys come from the environment (`JEV_API_KEY`/`TYPESAFE_API_KEY`/`AI_GATEWAY_API_KEY`); never commit them.
