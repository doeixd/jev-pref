# Setup interview (ask before generating; 3 core questions + 2 optional)

Run `npx jev-pref doctor` first and fix what it flags. Then ask:

1. **Suites** — `prefs` (their preferences) plus built-in `secrets` gate?
   Default/recommendation: both.
2. **Run trigger** — when must review run: after each task, before every
   commit (`--staged`), on PRs (`--pr`), other? Get their exact wording for
   the wired entry.
3. **Wire target** — `CLAUDE.md`, `AGENTS.md`, git hooks, agent hooks, CI, or
   several? Create agent files if missing; see `references/wiring.md`.
4. **Hunk granularity (optional)** — whole-diff (one cheap call) or `--hunks`
   (one call per hunk, file:line verdicts for inline comments)? Default:
   whole-diff; recommend hunks for PR review setups.
5. **Agent handoff (optional)** — after a failing/advisory verdict, pipe it to
   a command? E.g. `claude -p` for auto-fix, a notifier, a ticket filer.
   Record bin + args + which outcomes trigger it. Default: none.

State defaults and assumptions; do not interrogate beyond this. Thresholds
start at 0.7 — `npx jev-pref tune` calibrates later against real verdicts.

Record answers with `npx jev-pref init` (interactive) or
`npx jev-pref init --yes --suites prefs,secrets --trigger "..." --wire both`
(plus `--scope staged|pr`, `--hunks`, `--agent-cmd "..."` as answered).

Stacks: the engine covers TypeScript Gateway + direct paths. Effect v4
codebases get `assets/review-script-effect.ts` (direct key only). Python /
`ai-cli` are hand-authored. Only ask about stack if the project clearly is
not TS-on-Node — otherwise assume the engine.

Keys: confirm `JEV_API_KEY`, `TYPESAFE_API_KEY`, or `AI_GATEWAY_API_KEY` is
set in env; never write keys into files.
