// Suite: secrets — built-in gate for leaked credentials/PII in the diff.
// Always gates (a leak is never advisory-only); threshold configurable.
// Batches into the same Jev call as prefs — more questions ≈ same latency.

export const SUITE_ID = "secrets";

export function buildQuestions() {
  return {
    sec_leak: {
      type: "noul",
      instructions:
        "Does `diff` introduce a hardcoded secret, API key, token, private key, password, or connection string into tracked files (excluding test fixtures and redacted examples)? Answer true only for a concrete instance in the changed lines.",
    },
    sec_pii: {
      type: "noul",
      instructions:
        "Does `diff` introduce real-looking personal data (emails, phone numbers, addresses, government IDs) outside test fixtures and docs examples? Answer true only for a concrete instance in the changed lines.",
    },
  };
}

export function judge(answers, { gateThreshold }) {
  const failures = [];
  for (const [key, label] of [["sec_leak", "possible secret"], ["sec_pii", "possible personal data"]]) {
    const prob = answers[key]?.chance ?? 0;
    if (prob >= gateThreshold) failures.push(`${key} P=${prob.toFixed(2)} (${label})`);
  }
  if (failures.length > 0) return { outcome: "fix_now", severity: 2, next: "fix_now", failures, notes: [] };
  return { outcome: "approve", severity: 0, next: "approve", failures: [], notes: [] };
}
