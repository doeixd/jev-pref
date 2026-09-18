# jev-pref principles

The formal boundary behind the tool. For the short version, see
[What jev-pref is for](../README.md#what-jev-pref-is-for).

## The boundary

Jev is not a general-purpose senior code reviewer. It works best when **you
define what counts** and the evidence needed to answer is present in the input.

A useful semantic check is:

- **Externally defined:** the project or user determines what counts.
- **Evidence-grounded:** the answer follows from information supplied to Jev.
- **Narrow:** one check represents one meaningful judgment.
- **Actionable:** a finding gives the coding agent information it can use.
- **Calibratable:** labeled examples reveal whether the check works.
- **Complementary:** deterministic tooling does not already enforce it well.

If a check depends mostly on the evaluator's own sense of what is elegant,
safe, clean, or good, it is not ready to become a Jev check.

## The contract

```text
YOU define the rule.
JEV classifies the evidence.
JEV-PREF determines the outcome.
YOUR AGENT acts on the result.
```

The evaluator does not own your definition of quality. The project does.

## Why this layer exists

Coding agents are good at building things. They can also drift from project
conventions while they work:

- introducing a second abstraction for something that already exists;
- widening an API beyond the project's defined policy;
- adding configuration where the project requires an existing composition
  mechanism;
- creating shared state where the architecture forbids it;
- changing a public API in a way the project defines as breaking;
- crossing project-specific architectural boundaries.

Many of these rules are difficult or impractical to encode in ESLint,
TypeScript, or ordinary static analysis. They can still be concrete enough to
evaluate from a code change.

```text
                  deterministic tooling

formatter ─────── formatting
TypeScript ────── types
ESLint ────────── static rules
tests ─────────── behavior

                       │
                       ▼

jev-pref ─────── semantic project rules

                       │
                       ▼

                 coding agent
                 fixes findings
```

## Architecture

```text
                 HUMAN / PROJECT
                       │
                       ▼
             explicit semantic rules
                       │
                       ▼
                 jev-pref config
                       │
                       ▼
                    git diff
                       │
                       ▼
                ┌────────────┐
                │    Jev     │
                │ classifier │
                └─────┬──────┘
                      │
             typed answers + confidence
                      │
                      ▼
             deterministic policy
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       approve     advisory    fix_now
          │           │           │
          └───────────┼───────────┘
                      ▼
                 coding agent
                      │
                      ▼
                  improved code
```
