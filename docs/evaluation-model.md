# Evaluation model

Reference for how Jev answers map to outcomes. For the short version, see
[review](../README.md#jev-pref-review) and
[fixed classifications](../README.md#fixed-classifications-are-powerful).

## Bernoulli questions, not true/false ones

A condition asks Jev to estimate p(true) from visible evidence (Jev native
type `noul`, answered `{chance: P}`); the threshold is the decision boundary
on p. Name the visible fact that moves p in `guidance` ("count only ...")
rather than restating truth conditions.

## Confidence vs probability

Classification confidence and policy severity stay separate. Thresholds gate
on probability (P) only; confidence is displayed (for example
`P=0.86 confidence=0.73`) but never gates, suppresses, or applies an outcome.
An important gate does not block unless its probability crosses the configured
gate threshold; a high-confidence advisory remains non-blocking.

## Which threshold governs what

`gateThreshold` governs gate conditions, secrets, AND `fix_now`-mapped choice
labels; `advisoryThreshold` governs advisory conditions and advisory-mapped
labels (a `fix_now` label between the two reports an uncertain-gate note).

## Below-cutoff fallthrough

A choice whose top label scores below its outcome's cutoff falls through to
approve for that scope — no failure, no note, no fallback to the next label —
while the classification line is still printed.
