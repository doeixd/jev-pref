---
name: jev-pref
description: Set up Jev (TypeSafe System One evaluation model) as a durable user-preference code reviewer. Use whenever the user mentions Jev, jev-pref, preference-based review, reviewing diffs/commits/PRs against CLAUDE.md or AGENTS.md, or wiring a post-work review script.
---

# jev-pref — Jev preference reviewer setup

Turn the project's `CLAUDE.md` / `AGENTS.md` preferences into a durable script
that uses Jev to review working changes, and wire it to run after bouts of work.

Jev is **not** a chat model. It does not write code or explanations. It takes
`state` + typed `questions` and returns typed answers + probabilities. Your
generated script owns control flow and thresholds. Read
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

### 3. Interview the user

Ask before generating. Cover every item in `references/setup-interview.md`:

- script path (suggest `scripts/jev-review.mjs`, confirm)
- stack (TypeScript + AI Gateway `experimental_evaluate` preferred; alternatives:
  direct `@typesafe-ai/sdk`, Python `typesafe-sdk`, shell `ai-cli`)
- review scope (working tree, staged, commit range, PR diff)
- which prefs are hard gates vs. advisory, and thresholds
- when the check runs (after each task, before commit, on PR, etc.)
- which file(s) to wire (`CLAUDE.md` and/or `AGENTS.md`)

### 4. Generate the review script

1. If the stack is TypeScript + Gateway or direct SDK: copy
   `assets/review-script-template.mjs` to the agreed path. If the user chose
   Python or `ai-cli`: no template is bundled — hand-author the equivalent
   (one boolean per pref, one severity Score, one `next` Choice, thresholds in
   code) using `references/jev-essentials.md` for the API shape. If the codebase
   is Effect v4: copy `assets/review-script-effect.ts` instead (needs
   `TYPESAFE_API_KEY`; Gateway-only shops keep the `.mjs` template).
2. Translate each preference into **one narrow Jev question** per
   `references/prefs-to-questions.md` (one boolean/Noul per pref — Gateway calls
   it `boolean`, native calls it `noul`, same semantics — plus one severity Score
   and one Choice for next action; always include an `other` option on the Choice).
3. Keep thresholds in code, not in questions. Never ask Jev to write code,
   explain, quote text, count, or do math.
4. Support at minimum: `--diff <git-ref-or-empty>` (empty = working tree,
   validated against an allowlist, no shell interpolation), `--dry-run` (print
   questions without calling Jev), state that includes `git status` + untracked
   files + truncation notice, exit 1 on gate failure, exit 2 on infra/config
   error, human-readable verdict on stdout.

### 5. Wire CLAUDE.md / AGENTS.md

Append the snippet from `assets/claude-md-snippet.md` (adapted) to the file(s)
the user chose, per `references/wiring.md`. State exactly when to run the
script and how to act on pass / advisory / gate-failure. If the harness
supports hooks (e.g. Claude Code `PostToolUse`), prefer those for enforcement —
the markdown block alone is advisory and agents routinely skip it.

### 6. Verify

1. If modifying this skill repo: `node scripts/validate-skills.mjs`.
2. Dry-run the generated script on a real diff in the target project.
3. With a key available (`AI_GATEWAY_API_KEY` or `TYPESAFE_API_KEY`), run one
   live check; without a key, leave verification steps for the user.
4. Report: script path, wired files, gates vs. advisory list, how to run.
   Cap fix re-runs at 3 — then escalate to the user instead of looping.

## Rules

- One judgment per question. Split multi-factor prefs; combine in code.
- `state` is a named object (`prefs`, `diff`, `untracked_files`, `git_status`,
  `context`), not a pasted transcript.
- Schema-valid answers are not correctness — calibrate thresholds on real diffs.
- Never store API keys in the script. Env only.
- Keep this SKILL.md lean; load a reference file only when its step is active.
