# Jev essentials (distilled from JEV_AGENT_BRIEF, verified 2026-09-17)

## What Jev is

System One evaluation model from TypeSafe AI. Input: `state` (material to judge:
string, JSON object, or array of text) + `questions` (named map of typed questions).
Output: typed answers + probabilities in one parallel pass (~70–500 ms).

```
state + typed questions → Jev → answers + probabilities → your code decides
```

Questions in one request share the same `state`, run in parallel and in isolation,
and do not see each other. If question B needs answer A, that is a **second request**.
Otherwise batch everything. Shared budget ~32k tokens per request.

## The three primitives

Native names: **Choice / Score / Noul**. Vercel AI SDK + Gateway + `ai-cli`
rename Noul to **boolean**. Same semantics.

- **Choice** — one of an unordered set. Switch on the key in code.
  Answer: `choice` + `probabilities` per key + `confidence` (peakedness, not P).
  Limits ~1–255 options. Always include `other`/`none`.
- **Score** — position on an ordered rubric (severity, quality). Do not use for
  unordered labels. Answer: float `score` on `[0, levels-1]` (may land between
  levels) + `legend` + `probabilities` + `confidence`. Limits ~2–10 levels.
  Keep arithmetic in code; Jev is weak at numeric precision.
- **Noul / boolean** — P(statement is true) in `[0, 1]`. `0.5` = coin flip, not
  "medium". No separate confidence. Optional `criteria: { true, false }` to pin
  both sides.

## Writing state and questions

- Prefer a **named object** (`{ diff, prefs, context }`). Text only.
- Reference fields with backticked paths in `instructions`: `` `diff` ``.
- One narrow judgment per question. Jev is literal; write the exact condition.
- Decompose: `refund_requested` (noul) + `already_refunded` (noul) + `tone` (score),
  then `if (refund_requested && !already_refunded && tone >= 1)` in code.
- Question keys are yours only; they are not sent into inference.
- **Thresholds live in code.** Starting pattern: P ≥ 0.9 act, mid band escalate,
  P ≤ 0.1 act on the negative. Calibrate on labeled examples from the workflow.
  Prefer `probabilities[key]` / `noul` over vendor `confidence`.

## Failure modes (jev-1.13)

Literal reading, math/numbers, indirection ("given all of the above, what to do?"),
packed multi-clause factors, missing `other` (it picks least-bad anyway).

## Auth and models

| Path | Env | Model string |
| --- | --- | --- |
| Vercel AI Gateway (preferred if on Vercel) | `AI_GATEWAY_API_KEY` | `typesafe-ai/jev` or `typesafe-ai/jev-latest` |
| TypeSafe direct | `TYPESAFE_API_KEY` / `TYPESAFE_AI_API_KEY` | `jev-latest` (alias; pin e.g. `jev-1.13.0` if thresholds tuned) |

~$0.042/1M input tokens, output free. Honor `Retry-After` on 429.

## Stack decision tree

- Generated text/code/plan needed → an LLM, not Jev.
- TS app on Vercel/AI SDK → `experimental_evaluate` (`ai@7.0.105+`), model
  `"typesafe-ai/jev"`, question types `choice` / `score` / `boolean`.
- TS direct → `@typesafe-ai/sdk` (`TypeSafeClient.systemOne`, helpers
  `choice`/`noul`/`score`, else raw `{ type, instructions, criteria }`).
- Python → `typesafe-sdk` (`TypeSafeClient.system_one`, `Choice`/`Noul`/`Score`).
- Shell one-off → `ai evaluate --boolean/--choice/--score` (`ai-cli`).
- No SDK → `POST https://api.typesafe.ai/v1/systemone` with
  `{ model: "jev-latest", state, questions }`.

Never: parse Jev output as markdown, ask it to "return JSON", paste whole
transcripts into state, encode a 5-point scale as boolean, or treat Gateway vs.
direct as different models (same Jev, different door).

Canonical links: `https://docs.typesafe.ai/llms.txt` (index),
`/concepts/system-one`, `/concepts/state`, `/primitives`, `/api`,
`/sdk/javascript`, `/sdk/python`, `/models`, `/model-jaggedness/jev-1.13`.
