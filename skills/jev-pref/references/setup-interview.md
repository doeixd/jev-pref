# Setup interview (ask before generating)

Ask all of these; do not guess. Record answers in the script header.

1. **Script path** — default `scripts/jev-review.mjs`. Confirm or take theirs.
2. **Stack** — default TypeScript + AI Gateway (`experimental_evaluate`,
   `AI_GATEWAY_API_KEY`). Alternatives: direct `@typesafe-ai/sdk`
   (`TYPESAFE_API_KEY`), Python `typesafe-sdk`, shell `ai-cli`. Pick one.
3. **Review scope** — which diffs: working tree (default), staged only, commit
   range (`HEAD~n...HEAD`), PR diff? Support `--diff` flag accordingly.
4. **Prefs classification** — for each extracted pref: hard gate (fails the run)
   or advisory (notes only)? Default threshold 0.7; ask if they want stricter.
5. **Run trigger** — when must the agent run it: after each task, before every
   commit, on PRs, other? Get their exact wording for the CLAUDE.md entry.
6. **Wire target** — `CLAUDE.md`, `AGENTS.md`, or both? Create the file if missing.
7. **Keys** — confirm `AI_GATEWAY_API_KEY` or `TYPESAFE_API_KEY` is set in env;
   never write keys into files.
