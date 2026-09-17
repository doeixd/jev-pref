# Translating CLAUDE.md / AGENTS.md prefs into Jev questions

## Extract prefs

Turn each preference bullet into one testable statement. Keep the pref ID so the
script can report which pref failed.

```text
Raw pref: "Use early returns; avoid deep nesting."
→ pref_early_returns: "Code uses early returns instead of deep nesting."
```

Drop non-reviewable prefs (e.g. "be concise in chat") from the Jev set; enforce
those in the agent instructions instead.

## Mapping

| Pref kind | Question type | Shape |
| --- | --- | --- |
| Single rule ("no `any`", "early returns") | Noul/boolean per pref (Gateway calls it `boolean`, native calls it `noul` — same thing) | `instructions`: "Does `diff` violate <exact rule>?" (no quotes/explanations — Jev returns typed answers only) |
| Degree ("how severe is the drift") | Score | 3 levels: `["No drift", "Minor drift", "Blocks merge"]` |
| Next step | Choice | `fix_now` / `advisory` / `approve` / `other`, with criteria text |

Always add an `other`/`none` Choice option. For Noul/boolean questions,
below-threshold simply means "no violation" — there is no none-option to add.

## Examples

Good (one factor each):

```json
{
  "pref_no_any": { "type": "boolean", "instructions": "Does `diff` introduce TypeScript `any` (excluding test fixtures)?" },
  "pref_early_returns": { "type": "boolean", "instructions": "Does `diff` add nesting deeper than 2 levels where an early return would apply?" },
  "severity": { "type": "score", "instructions": "How far does `diff` drift from `prefs`?", "criteria": ["No drift", "Minor drift; note only", "Blocks merge"] },
  "next": { "type": "choice", "instructions": "Which single review outcome applies to `diff` given `prefs`?", "criteria": { "approve": "Meets all prefs", "advisory": "Minor notes only", "fix_now": "Gate violated; must fix", "other": "None of the above" } }
}
```

(`boolean` = Gateway/AI SDK name for native `noul`. Use `boolean` in Gateway
scripts; the direct-SDK path maps it to `noul` automatically. Prefer snake_case
ids — some SDKs restrict question-key charset.)

Bad (do not do):

```text
"Does this follow our standards and is it severe and what should we do?"
→ packs three factors. Split into booleans + score + choice.
"Explain why this is bad" → Jev cannot explain. Code formats the verdict.
"Count the violations" → Jev cannot count. Use one question per pref, count in code.
```

## Composition in code

```text
gates = [pref_no_any, pref_no_secrets, ...]  # P(true) = violation
if any gate P >= gate_threshold (default 0.7): exit 1 (fix_now)
elif severity >= 1.5 or next == "fix_now": exit 1
elif next == "advisory" or any advisory P >= 0.7: exit 0 with notes
else: exit 0 approve
exit 2 = infra/config error (never treat as approval)
```

Precedence: the code order above wins. Jev's `next` choice is advisory input,
not the verdict — if per-pref gates fail but `next` says `approve`, the run
still fails. Never let `next` override a gate.

Calibrate thresholds on 5–10 labeled diffs from the repo (keep them in
`evals/`: the diff plus the expected verdict, re-checked with `--dry-run`).
Record the chosen values in the script header comment.
