# Review scopes and budgets

Reference for what Jev receives and what a review costs. For the short
version, see [review](../README.md#jev-pref-review).

## Token and diff budgets

Jev accepts at most 30k input tokens, including the review state and
questions. `jev-pref` uses a conservative per-request diff budget, splits
bounded file or hunk scopes when necessary, and fails loudly rather than
approving truncated or incomplete input. Review changes while they are still
small, or narrow them with `--include` and `--exclude`.

## What Jev sees per call (the evidence envelope)

Each Jev call receives exactly the serialized `{state, questions}` pair that
`--dry-run` prints — nothing else. `state` carries the call's pref subset,
the `diff` body (one hunk/file, or the whole diff for change-scoped and
whole-diff calls), `hunk {file, label, header}` (`--hunks`), `changed_file`
(`--files`), or `new_file` (untracked), plus `untracked_files`, `git_status`,
`diff_stat`, `context`, and a completeness note. Filenames ARE visible via
diff/hunk headers and the file/label fields; the rest of the repo is NOT.
Write guidance against that envelope.

## Scope kinds

Prefs default to `hunk` scope (evaluated per hunk/file scope) while
`change`-scoped prefs evaluate once against the whole diff — use `change`
for whole-diff predicates such as "does this change modify AGENTS.md?".

## Cost model

Calls are sequential: one Jev call per hunk/file scope, plus one whole-diff
call when any pref is `change`-scoped. 10 hunks ~= 10 calls. Prefer `--files`
for broad reviews (one call per file) and narrow with `--include`/`--exclude`
before raising `--max-hunks`.
