# jev-pref repository instructions

This repository dogfoods jev-pref. Executable review policy lives only in the
root `jev-pref.json`; do not duplicate its preferences in agent instructions.

## Preference review

After a substantial bout of implementation work, run:

    npx jev-pref review --hunks

When testing unpublished engine changes locally, use
`node packages/jev-pref/bin/jev-pref.js review --hunks`.

Jev accepts at most 30k input tokens. Run review before changes become large;
use `--files` or `--include`/`--exclude` for broader work.

- Fix blocking findings and rerun the review.
- Consider every advisory finding; address it or explain why it does not apply.
- Continue normally after approval.
- Treat exit code 2 as a setup or infrastructure error, never as approval.
- Stop after 3 review/fix iterations and ask the user how to proceed.

## Keep Jev preferences synchronized

Jev preferences are derived from the project's development guidance. Whenever
you make a meaningful change to this file, another agent instruction file,
coding conventions, architecture guidance, or similar project policy, run:

    npx jev-pref sync

Follow its reconciliation instructions. Do not mechanically translate every
instruction into a Jev preference. Encode only externally defined conditions
that can be judged from evidence in the review input. Prefer concrete yes/no
conditions or fixed user-defined classifications. Do not ask Jev whether code
is broadly good, clean, simple, idiomatic, safe, or well-designed. Keep
procedural guidance here, and prefer deterministic tooling for rules it can
decide reliably. Ask the user when observable criteria or the intended mapping
are ambiguous.

Likewise, when changing `jev-pref.json`, check whether corresponding human-
readable guidance should change. Shared policy lives in `jev-pref.json`;
personal additions or overrides belong in gitignored `jev-pref.local.json`.

Jev authentication is expected through `TYPESAFE_API_KEY`. Never store its
value in repository files.
