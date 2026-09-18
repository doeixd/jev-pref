// Suite: prefs — user-defined evidence questions only. Jev classifies the
// visible change; jev-pref deterministically maps probabilities or fixed labels
// to outcomes. It never asks Jev to invent an overall quality or severity.

export const SUITE_ID = "prefs";

function kind(pref) {
  return pref.type ?? "condition";
}

function question(pref) {
  return pref.question ?? pref.text;
}

export function describePreference(pref) {
  if (kind(pref) === "choice") {
    const mapping = Object.entries(pref.outcomes).map(([label, outcome]) => `${label}->${outcome}`).join(", ");
    return `${pref.id} [choice: ${mapping}]: ${pref.question}`;
  }
  return `${pref.id} [${pref.gate ? "gate" : "advisory"}]: ${question(pref)}`;
}

export function buildQuestions(prefs) {
  const questions = {};
  for (const pref of prefs) {
    const instructions = pref.guidance
      ? `${question(pref)}\n\nProject definition: ${pref.guidance}`
      : question(pref);
    if (kind(pref) === "choice") {
      questions[`pref_${pref.id}`] = {
        type: "choice",
        instructions,
        criteria: pref.labels,
      };
    } else {
      questions[`pref_${pref.id}`] = {
        type: "noul",
        instructions: `${instructions} Answer true only when the defined condition is visible in the supplied change.`,
      };
    }
  }
  return questions;
}

function probabilityOf(answer) {
  if (!answer || typeof answer !== "object") return 0;
  if (typeof answer.chance === "number") return answer.chance;
  const selected = answer.choice;
  if (typeof selected === "string" && typeof answer.probabilities?.[selected] === "number") {
    return answer.probabilities[selected];
  }
  return typeof answer.confidence === "number" ? answer.confidence : 0;
}

/** Advocaat answers nouls as { chance }; choices as { choice, confidence, probabilities }. */
export function judge(prefs, answers, { gateThreshold, advisoryThreshold }) {
  const failures = [];
  const notes = [];
  const classifications = [];
  for (const pref of prefs) {
    const answer = answers[`pref_${pref.id}`];
    const probability = probabilityOf(answer);
    if (kind(pref) === "choice") {
      const label = answer?.choice;
      if (typeof label !== "string" || !(label in pref.outcomes)) continue;
      const configuredOutcome = pref.outcomes[label];
      classifications.push({
        id: pref.id,
        label,
        probability,
        confidence: typeof answer.confidence === "number" ? answer.confidence : undefined,
        outcome: configuredOutcome,
      });
      const detail = `${pref.id}=${label} P=${probability.toFixed(2)} (${pref.question})`;
      if (configuredOutcome === "fix_now" && probability >= gateThreshold) failures.push(detail);
      else if (configuredOutcome === "fix_now" && probability >= advisoryThreshold) notes.push(`uncertain gate: ${detail}`);
      else if (configuredOutcome === "advisory" && probability >= advisoryThreshold) notes.push(detail);
      continue;
    }

    classifications.push({ id: pref.id, probability, outcome: pref.gate ? "fix_now" : "advisory" });
    if (probability >= (pref.gate ? gateThreshold : advisoryThreshold)) {
      const detail = `${pref.id} P=${probability.toFixed(2)} ${question(pref)}`;
      (pref.gate ? failures : notes).push(detail);
    }
  }
  if (failures.length > 0) return { outcome: "fix_now", failures, notes, classifications };
  if (notes.length > 0) return { outcome: "advisory", failures, notes, classifications };
  return { outcome: "approve", failures, notes, classifications };
}
