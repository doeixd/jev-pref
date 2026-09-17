// Suite: prefs — one noul per user preference + severity score + next choice.
// Question ids are namespaced `pref_<id>` so multiple suites batch into one
// Jev call without collisions. Judge precedence: gates first; `next` never
// overrides a gate (see references/prefs-to-questions.md).

export const SUITE_ID = "prefs";

export function buildQuestions(prefs) {
  const questions = {};
  for (const p of prefs) {
    questions[`pref_${p.id}`] = {
      type: "noul",
      instructions:
        `Does \`diff\` violate ${p.id} (${p.text})? Answer true only for a concrete violation in the changed lines.`,
    };
  }
  questions.pref_severity = {
    type: "score",
    instructions: "How far does `diff` drift from `prefs`?",
    criteria: ["No drift", "Minor drift; note only", "Blocks merge"],
  };
  questions.pref_next = {
    type: "choice",
    instructions: "Which single review outcome applies to `diff` given `prefs`?",
    criteria: {
      approve: "Meets all prefs.",
      advisory: "Minor notes only; safe to continue.",
      fix_now: "A gate pref is violated; must fix before continuing.",
      other: "None of the above.",
    },
  };
  return questions;
}

/** Advocaat answers nouls as { chance }; scores as { score }; choices as { choice }. */
export function judge(prefs, answers, { gateThreshold, advisoryThreshold, severityFail }) {
  const failures = [];
  const notes = [];
  for (const p of prefs) {
    const prob = answers[`pref_${p.id}`]?.chance ?? 0;
    if (prob >= (p.gate ? gateThreshold : advisoryThreshold)) {
      (p.gate ? failures : notes).push(`${p.id} P=${prob.toFixed(2)} ${p.text}`);
    }
  }
  const severity = answers.pref_severity?.score ?? 0;
  const next = answers.pref_next?.choice ?? "other";
  if (failures.length > 0 || next === "fix_now" || severity >= severityFail) {
    return { outcome: "fix_now", severity, next, failures, notes };
  }
  if (notes.length > 0 || next === "advisory") {
    return { outcome: "advisory", severity, next, failures, notes };
  }
  return { outcome: "approve", severity, next, failures, notes };
}
