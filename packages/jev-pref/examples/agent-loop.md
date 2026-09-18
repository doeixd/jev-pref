## Jev preference review

After a substantial bout of implementation work, run:

    npx jev-pref review --hunks

Treat the result as an independent semantic review of the current diff.
Jev accepts at most 30k input tokens, so run the review while the change is
still small. `--hunks` keeps each request focused and independently bounded.
For broad changes, review logical slices with `--include`/`--exclude`.

- Fix blocking findings and rerun the review.
- Consider every advisory finding; address it or explain why it does not apply.
- Continue normally after approval.
- Treat exit code 2 as a setup or infrastructure error, never as approval.
- Stop after 3 review/fix iterations and ask the user how to proceed.

Shared review preferences are defined in `jev-pref.json`; optional personal
preferences are layered from gitignored `jev-pref.local.json`.

### Keep Jev preferences synchronized

Jev preferences are derived from the project's development guidance. Whenever
you make a meaningful change to this file, another agent instruction file,
coding conventions, architecture guidance, or similar project policy, run:

    npx jev-pref sync

Follow its reconciliation instructions. Update Jev preferences when the changed
guidance adds, removes, weakens, strengthens, or otherwise changes a semantic
rule that can usefully be judged from a code change.

Do not mechanically translate every instruction into a Jev preference. Encode
only externally defined conditions that can be judged from evidence in the
review input. Prefer concrete yes/no conditions or fixed user-defined labels.
Do not ask Jev whether code is broadly good, clean, simple, idiomatic, safe, or
well-designed. Keep procedural guidance in agent files, use deterministic
tooling for rules it can decide reliably, and ask the user when observable
criteria or the intended mapping are ambiguous.

Likewise, when changing Jev preferences, check whether the corresponding human-
readable project guidance should also change.

Shared policy lives in `jev-pref.json`. Optional personal additions and same-id
overrides live in gitignored `jev-pref.local.json`.
