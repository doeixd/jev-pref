# `doeixd/jev-pref/actions/review`

Review PR diffs with Jev: sticky PR comment, file annotations, and an
outcome-driven check status. Needs checkout with `fetch-depth: 0`.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- uses: doeixd/jev-pref/actions/review@master
  with:
    api-key: ${{ secrets.TYPESAFE_API_KEY }}
```

> Requires the published `jev-pref` npm package (default `engine-version:
> latest`). Pre-release, point `engine:` at a local checkout instead:
> `engine: ./packages/jev-pref/bin/jev-pref.js` — and install its
> dependencies first (`npm ci` in the engine directory), since a local
> path runs with whatever `node_modules` is present.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `suites` | `prefs,secrets` | CSV suites to run |
| `fail-on` | `gates` | `gates` (fail on gate violations), `all` (advisories too), `never` (comment only) |
| `comment-mode` | `both` | `both`, `summary`, `annotations`, `none` |
| `granularity` | `files` | `files` (recommended), `hunks`, or `whole`; scoped modes avoid oversized Jev requests |
| `max-scopes` | `25` | Maximum scoped Jev calls before failing with guidance to narrow the PR |
| `gate-threshold`, `advisory-threshold` | _(config)_ | Per-run overrides |
| `config-path` | _(auto)_ | Path to `jev-pref.json` |
| `working-directory` | `.` | Directory to review |
| `base` | _(PR base)_ | Base ref override for the diff |
| `paths`, `paths-ignore` | _(all)_ | Glob filters on changed files (`**`, `*`, `?`); skips silently when nothing matches |
| `engine` | _(npx)_ | Package spec (`jev-pref@0.2.0`, run via npx) or `./path/to/jev-pref.js` for local/monorepo pins |
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
  Per-file/per-hunk output is aggregated per suite with scope prefixes.
- Jev has a 30k-token input limit. The Action defaults to per-file requests and
  fails loudly instead of approving a truncated or oversized review.
- File annotations (`error` on gates, `warning` on advisories) surface in the
  Files tab, attached per file.
- Check fails iff `fail-on` says so. Engine infra errors always fail loud.
- Forks without secrets degrade per `on-forks` (tokens are read-only there).

See `examples/`: `strict.yml`, `advisory.yml`, `nightly-tune.yml`.
