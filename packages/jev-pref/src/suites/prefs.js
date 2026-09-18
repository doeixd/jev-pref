// Suite: prefs — user-defined evidence questions only. Jev classifies the
// visible change; jev-pref deterministically maps probabilities or fixed labels
// to outcomes. It never asks Jev to invent an overall quality or severity.

export const SUITE_ID = "prefs";

function kind(pref) {
  return pref.type ?? "condition";
}

export function prefScope(pref) {
  return pref.scope ?? "hunk";
}

/** Human-readable title for reviews and comments; falls back to the id. */
export function displayName(pref) {
  return typeof pref?.name === "string" && pref.name.length > 0 ? pref.name : pref?.id;
}

/** Finding headline: "Name (id)" when named, otherwise the bare id. */
export function headline(pref) {
  return typeof pref?.name === "string" && pref.name.length > 0 ? `${pref.name} (${pref.id})` : pref?.id;
}

export function partitionPrefs(prefs) {
  const hunkPrefs = [];
  const changePrefs = [];
  for (const p of prefs ?? []) {
    (prefScope(p) === "change" ? changePrefs : hunkPrefs).push(p);
  }
  return { hunkPrefs, changePrefs };
}

/** Jev wire type "noul" is a condition (chance-based); display it as such. */
export function displayQuestionType(wireType) {
  return wireType === "noul" ? "condition" : wireType;
}

function question(pref) {
  return pref.question ?? pref.text;
}

export function summarizePreference(pref) {
  const base = { id: pref.id, kind: kind(pref), scope: prefScope(pref), question: question(pref) };
  if (typeof pref.name === "string" && pref.name.length > 0) base.name = pref.name;
  if (typeof pref.description === "string" && pref.description.length > 0) base.description = pref.description;
  if (kind(pref) === "choice") {
    base.labels = Object.keys(pref.labels ?? {});
    base.outcomes = pref.outcomes;
  } else {
    base.gate = !!pref.gate;
  }
  return base;
}

export function describePreference(pref) {
  const scopeSuffix = prefScope(pref) === "change" ? ",change" : "";
  if (kind(pref) === "choice") {
    const mapping = Object.entries(pref.outcomes).map(([label, outcome]) => `${label}->${outcome}`).join(", ");
    return `${pref.id} [choice${scopeSuffix}: ${mapping}]: ${pref.question}`;
  }
  return `${pref.id} [${pref.gate ? "gate" : "advisory"}${scopeSuffix}]: ${question(pref)}`;
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
        ...(typeof pref.name === "string" && pref.name.length > 0 ? { name: pref.name } : {}),
        label,
        probability,
        confidence: typeof answer.confidence === "number" ? answer.confidence : undefined,
        outcome: configuredOutcome,
      });
      const detail = `${headline(pref)}=${label} P=${probability.toFixed(2)} (${pref.question})`;
      if (configuredOutcome === "fix_now" && probability >= gateThreshold) failures.push(detail);
      else if (configuredOutcome === "fix_now" && probability >= advisoryThreshold) notes.push(`uncertain gate: ${detail}`);
      else if (configuredOutcome === "advisory" && probability >= advisoryThreshold) notes.push(detail);
      continue;
    }

    classifications.push({ id: pref.id, probability, outcome: pref.gate ? "fix_now" : "advisory" });
    if (probability >= (pref.gate ? gateThreshold : advisoryThreshold)) {
      const detail = `${headline(pref)} P=${probability.toFixed(2)} ${question(pref)}`;
      (pref.gate ? failures : notes).push(detail);
    }
  }
  if (failures.length > 0) return { outcome: "fix_now", failures, notes, classifications };
  if (notes.length > 0) return { outcome: "advisory", failures, notes, classifications };
  return { outcome: "approve", failures, notes, classifications };
}
