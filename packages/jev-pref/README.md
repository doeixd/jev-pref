# jev-pref (engine)

Jev-powered user-preference code reviewer. Installs as a binary via npx; pairs
with the `jev-pref` agent skill (skills.sh: `doeixd/jev-pref`).

## Install

```bash
npx jev-pref doctor       # sanity check (node >= 20, git, keys, config)
```

No global install needed. For hooks, pin a version: `npx jev-pref@0.1.0 review`.

## Commands

```bash
npx jev-pref review [--diff REF] [--staged] [--pr] [--suites prefs,secrets]
                    [--json] [--dry-run] [--fail-on gates|all|never]
                    [--gate-threshold N] [--advisory-threshold N]
                    [--config PATH] [--model M] [--timeout-ms MS]
npx jev-pref init [--yes] [--stack S] [--scope S] [--suites S] [--trigger T]
                  [--wire claude|agents|both|none] [--out PATH] [--print]
npx jev-pref tune [--sweep] [--evals-dir DIR] [--dry-run]
npx jev-pref doctor [--verbose]
```

Exit codes: `0` approve/ok, `1` gate violated, `2` infra/config/usage error
(never treat 2 as approval).

## Config precedence

CLI flags > `JEV_*` env vars > `jev-pref.json` > fenced ` ```jev-prefs ` block
in `CLAUDE.md`/`AGENTS.md` > built-ins. See `schema.json` for the full shape.

| Env | Meaning |
| --- | --- |
| `JEV_API_KEY` | Explicit key (else advocaat cascades `TYPESAFE_API_KEY` → `AI_GATEWAY_API_KEY` → `VERCEL_OIDC_TOKEN`) |
| `JEV_SUITES` | csv suite list, e.g. `prefs,secrets` |
| `JEV_GATE_THRESHOLD`, `JEV_ADVISORY_THRESHOLD`, `JEV_SEVERITY_FAIL` | Threshold overrides |
| `JEV_FAIL_ON` | `gates`\|`all`\|`never` |
| `JEV_TIMEOUT_MS`, `JEV_MAX_DIFF_CHARS`, `JEV_MODEL`, `JEV_BASE_URL`, `JEV_PROVIDER` | Client tuning |
| `JEV_ZERO_DATA_RETENTION` | Gateway zero-data-retention flag |
| `JEV_CONFIG` | Config path override |

Keys are env-only — never committed.

## Suites

- `prefs` — your `CLAUDE.md`/`AGENTS.md` preferences, one Jev noul each.
- `secrets` — built-in gate for leaked credentials/PII. Always gates.

Both suites batch into a single Jev call (more questions ≈ same latency).

## Evals

`evals/*.json`: `{ name, diff, expected: { prefId: true|false } }`.
`tune --sweep` reports accuracy per threshold and proposes a config diff.

## Jev client

Built on [`advocaat`](https://github.com/pithings/advocaat) (`ask()`), which
handles direct + Gateway + OIDC auth and typed answers. This package adds
429/529 retry with backoff, timeout signals, and the verdict/exit-code layer.
