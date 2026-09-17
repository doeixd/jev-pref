---
name: jev-pref
description: Set up Jev (TypeSafe System One evaluation model) as a durable user-preference code reviewer via the jev-pref engine. Use whenever the user mentions Jev, jev-pref, preference-based review, reviewing diffs/commits/PRs against CLAUDE.md or AGENTS.md, calibrating thresholds, or wiring a post-work review step.
---

# jev-pref — Jev preference reviewer setup

Turn the project's `CLAUDE.md` / `AGENTS.md` preferences into a running
`jev-pref` setup: prefs in config, review via `npx jev-pref review`, wired to
run after bouts of work.

Jev is **not** a chat model. It does not write code or explanations. It takes
`state` + typed `questions` and returns typed answers + probabilities. The
engine owns control flow and thresholds. Read
`references/jev-essentials.md` before writing any question.

## Workflow

Follow these steps in order. Do not skip the interview (step 3).

### 1. Read the source of truth

1. Read `references/jev-essentials.md` in this skill.
2. Read the live docs index at `https://docs.typesafe.ai/llms.txt` and follow
   only the pages relevant to the chosen stack (API contract, SDK usage).
   Live docs win over this skill on version-dependent details.
3. If the `typesafe-ai` skill (`npx skills add typesafe-ai/skills --skill typesafe-ai`)
   is available, consult it for SDK patterns.

### 2. Locate preferences

Find preference sources in the target project (not this repo):

1. Check for `CLAUDE.md` and `AGENTS.md` at the project root (and parent dirs).
2. If neither exists, ask the user to point at their prefs file or create one.
3. Extract each preference as a separate testable bullet. Read
   `references/prefs-to-questions.md` for the mapping rules.

### 3. Interview the user (3 core questions + 2 optional)

Run `npx jev-pref doctor` first and fix what it flags. Then ask, covering
`references/setup-interview.md`:

- suites (`prefs`, plus built-in `secrets` gate — recommend both)
- run trigger (after each task, before commit, on PRs — get exact wording)
- wire target (`CLAUDE.md`, `AGENTS.md`, hooks, CI — or several)
- hunk granularity + agent handoff (the two optional questions)

State your defaults and what you assumed. Do not interrogate beyond this;
thresholds start at 0.7 and `tune` calibrates later.

### 4. Configure (don't generate)

1. Run `npx jev-pref init` (or `--yes` with confirmed answers) to write
   `jev-pref.json` and the ` ```jev-prefs ` fenced block.
2. Fill the `prefs` array: one entry per preference
   (`{ id, gate, text }`, snake_case ids), translating per
   `references/prefs-to-questions.md`. Prefer editing `jev-pref.json`
   directly — it validates against `schema.json`.
3. Only hand-author scripts for stacks the engine doesn't cover (Effect →
   `assets/review-script-effect.ts`; Python/`ai-cli` → hand-authored per
   `references/jev-essentials.md`). Gateway/direct shops use the engine.

### 5. Wire the trigger

Add the run instruction per `references/wiring.md` (agent file, git hooks,
Claude Code hooks, or CI — same binary everywhere):
`npx jev-pref review` (add `--staged` pre-commit, `--pr` on PRs).
For GitHub repos, set up the PR action per `references/ci-setup.md`
(start advisory, go strict after calibration).
State exactly when it runs and how to act on pass / advisory / gate-failure.
If the harness supports hooks (e.g. Claude Code `PostToolUse`), prefer those
for enforcement — the markdown block alone is advisory and agents skip it.

### 6. Verify

1. `npx jev-pref review --dry-run` — inspect questions without spending a call.
2. With a key available (`JEV_API_KEY`/`TYPESAFE_API_KEY`/`AI_GATEWAY_API_KEY`),
   run one live check; without a key, leave verification steps for the user.
3. Report: config location, wired triggers, gates vs. advisory list, how to run,
   and that `tune` should revisit thresholds after real verdicts accumulate.
   Cap fix re-runs at 3 — then escalate to the user instead of looping.

## Rules

- One judgment per question. Split multi-factor prefs; combine in code.
- `state` is a named object, not a pasted transcript.
- Schema-valid answers are not correctness — calibrate thresholds on real diffs.
- Never store API keys in files. Env only.
- Keep this SKILL.md lean; load a reference file only when its step is active.
