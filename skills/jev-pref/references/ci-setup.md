# Setting up CI for a user's repo (agent guide)

The engine ships a reusable action; your job is to fit it to their repo.
Start from `actions/review/examples/` in this skill's repo — copy, don't invent.

## Which example first

1. **Always start with `advisory.yml`** (`fail-on: never`, comment only). Run
   it for a week of real PRs. This calibrates thresholds on their data before
   anything blocks merges.
2. Switch to **`strict.yml`** (`fail-on: gates`) once `tune` confirms, or keep
   advisory forever for style prefs and strict only for `secrets`.
3. Add **`nightly-tune.yml`** when `evals/` exists — it files a standing tune
   report issue so thresholds don't rot.

## Checklist (do all of these)

- [ ] Secret: repo Settings → Secrets → Actions → `TYPESAFE_API_KEY`
  (or `JEV_API_KEY`). Never commit keys; the action reads env only.
- [ ] Permissions block on the job (comments need them):
  `contents: read`, `pull-requests: write`, `issues: write`.
- [ ] Checkout with `fetch-depth: 0` — the action diffs `base...head`,
  which fails on shallow clones.
- [ ] Pin the action ref: `@v1` (or a SHA) instead of `@master` once released.
- [ ] Pin the engine too if reproducibility matters:
  `engine: npx jev-pref@0.1.0` (input `engine-version`).
- [ ] Fork policy: default `on-forks: dry-run`. Only use `skip` if even
  dry-run noise is unwanted. Tokens are read-only on fork PRs, so no live
  review or comments are possible there regardless.
- [ ] Branch protection (when going strict): require the `review` check.
- [ ] Monorepo: one job per area with `working-directory` + `paths` filters,
  each with its own `config-path`.

## Migrating advisory → strict

1. Collect 1–2 weeks of verdicts from PR comments.
2. Run `npx jev-pref tune --sweep --evals-dir <dir>` on labeled cases built
   from disputed verdicts (see `references/prefs-to-questions.md` calibration).
3. Flip `fail-on` to `gates`. Keep `secrets` strict from day one — leaks are
   never a calibration question.

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| No comment posted | Missing `pull-requests: write` / `issues: write` permissions |
| `cannot diff base...head` | Shallow checkout → `fetch-depth: 0` |
| `outcome: skipped` always | `paths` filter matches nothing — check globs against real paths |
| `outcome: error` | Invalid config or missing key — run `npx jev-pref doctor` locally |
| Huge PRs reviewed partially | Diffs truncate at `maxDiffChars` (stated in review state) — encourage smaller PRs |
| Comment spam on every push | Expected: the comment is sticky (updated in place, one per PR) |

## No-key CI

The `validate` job pattern (see this repo's `.github/workflows/validate.yml`)
runs `doctor` (informational) and `tune --dry-run` (needs no key) so PRs from
forks still get signal without secrets.
