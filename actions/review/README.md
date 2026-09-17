# `doeixd/jev-pref/actions/review`

Review PR diffs with Jev: sticky PR comment, file annotations, and an
outcome-driven check status. Needs checkout with `fetch-depth: 0`.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: doeixd/jev-pref/actions/review@v1
  with:
    api-key: ${{ secrets.TYPESAFE_API_KEY }}
```

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `suites` | `prefs,secrets` | CSV suites to run |
| `fail-on` | `gates` | `gates` (fail on gate violations), `all` (advisories too), `never` (comment only) |
| `comment-mode` | `both` | `both`, `summary`, `annotations`, `none` |
| `gate-threshold`, `advisory-threshold` | _(config)_ | Per-run overrides |
| `config-path` | _(auto)_ | Path to `jev-pref.json` |
| `working-directory` | `.` | Directory to review |
| `base` | _(PR base)_ | Base ref override for the diff |
| `paths`, `paths-ignore` | _(all)_ | Glob filters on changed files (`**`, `*`, `?`); skips silently when nothing matches |
| `engine` | _(npx)_ | `npx jev-pref@<engine-version>` by default; use `./path/to/jev-pref.js` for local/monorepo pins |
| `engine-version` | `latest` | Version when engine is npx |
| `on-forks` | `dry-run` | Fork PRs without secrets: `dry-run` (shape validation, no comment) or `skip` |
| `api-key` | _(env)_ | Key (prefer the `TYPESAFE_API_KEY` secret); ambient env also works |
| `github-token` | `github.token` | Needs `pull-requests: write` + `issues: write` for comments |
| `node-version` | `24` | — |

Permissions: `contents: read`, `pull-requests: write`, `issues: write`.

## Outputs

- `outcome`: `approve` | `advisory` | `fix_now` | `skipped` | `dry-run` | `error`.

## Behavior

- One sticky comment per PR (updated in place, collapsible per-suite details).
  Per-hunk engine output is aggregated per suite with `[file:line]` prefixes.
- File annotations (`error` on gates, `warning` on advisories) surface in the
  Files tab, attached per file.
- Check fails iff `fail-on` says so. Engine infra errors always fail loud.
- Forks without secrets degrade per `on-forks` (tokens are read-only there).

See `examples/`: `strict.yml`, `advisory.yml`, `nightly-tune.yml`.
