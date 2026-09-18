// `jev-pref sync` is a read-only reconciliation protocol for coding agents.
// Semantic policy changes stay with the human + agent; this command supplies a
// repeatable checklist and repository context.
import { inspectRepository } from "./setup.js";

function describeConfig(name, config) {
  if (!config?.exists) return `${name}: not found`;
  if (!config.valid) return `${name}: found but invalid JSON`;
  return `${name}: ${config.prefCount} preference${config.prefCount === 1 ? "" : "s"}`;
}

export function renderSync(info) {
  const guidance = info.sources.length > 0 ? info.sources.join(", ") : "none detected";
  return `jev-pref sync

You are reconciling the project's living preference contract. This command is
read-only. Do not make semantic policy changes without the user's agreement.

FILES TO REVIEW

  Project guidance: ${guidance}
  ${describeConfig("Shared policy (jev-pref.json)", info.config)}
  ${describeConfig("Personal policy (jev-pref.local.json)", info.localConfig)}

CONTRACT

  Human-readable guidance  <---- semantic alignment ---->  Jev policy
  What the project means                                 What a diff can show

Review behavior (agent instructions, hooks, CI, scripts) should execute that
policy. It should not become another copy of the preference text.

YOUR TASK

1. Read the relevant instruction, convention, and architecture files plus both
   Jev config layers. Inspect the current change that triggered synchronization.
2. Classify changed guidance:
   - mechanically enforceable -> deterministic tooling when practical
   - procedural -> agent guidance only
   - DIRECT -> externally defined answer visible in the review input; encode
   - NEEDS SHAPING -> useful intent with undefined subjective terms; ask
   - NOT FOR JEV -> unavailable evidence or subjective quality judgment
3. Check for:
   - guidance with no useful corresponding Jev preference
   - Jev preferences that are stale or no longer supported by guidance
   - rules whose meaning was weakened, strengthened, added, or removed
   - gate/advisory classifications that no longer match intent
   - hunk-scoped prefs asking whole-diff questions (use scope:change) and vice versa
   - duplicate, contradictory, or overly broad preferences
   - checks that ask Jev to invent what good, simple, clean, idiomatic, safe,
     adequate, or well-designed means
   - policy in the wrong ownership layer (shared versus personal)
4. Check the reverse direction too: for each changed Jev preference, determine
   whether the corresponding human-readable guidance should change.
5. Propose the smallest coherent reconciliation. Do not mechanically translate
   every instruction, and do not move personal policy into shared policy.
6. If intent or mapping is ambiguous, ask the user before editing policy.
7. After approved edits, run \`npx jev-pref review --dry-run\` and report which
   files and preference ids changed. If nothing needs changing, say why.

AUTHORING CHECK

For every Jev preference, ask:

1. Is the correct answer externally defined by the user or project?
2. Is the required evidence available in the review input?
3. Is it a Bernoulli question (visible evidence moving p(true), decided by a threshold) or a fixed user-defined taxonomy?
4. Would two reviewers applying the written definition usually agree?
5. Would deterministic tooling enforce it better?

Do not preserve a check merely because it already exists. Remove or reshape
subjective checks. Prefer fixed classifications when several defined categories
map to different outcomes. Fewer high-quality checks are better than broad
coverage. Default uncertain enforcement to advisory.

Local preferences merge by id over shared preferences. Same-id local entries
override the shared rule; new ids append. jev-pref.local.json should normally be
gitignored. Never print or persist credential values.`;
}

export async function sync(argv, { cwd = ".", out = console } = {}) {
  if (argv.positional.length > 0) {
    out.error(`review-error: sync takes no arguments (got ${argv.positional.join(" ")})`);
    return 2;
  }
  out.log(renderSync(inspectRepository(cwd)));
  return 0;
}
