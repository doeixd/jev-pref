import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuestions, displayQuestionType, judge, partitionPrefs, summarizePreference } from "../src/suites/prefs.js";
import { buildQuestions as buildSecrets, judge as judgeSecrets } from "../src/suites/secrets.js";

const prefs = [
  { id: "gate_one", gate: true, text: "Gate." },
  { id: "note_one", gate: false, text: "Note." },
];
const cfg = { gateThreshold: 0.7, advisoryThreshold: 0.6 };

describe("prefs suite", () => {
  it("creates only the user-defined preference questions", () => {
    const q = buildQuestions(prefs);
    assert.deepEqual(Object.keys(q), ["pref_gate_one", "pref_note_one"]);
  });

  it("uses judgment-shaped question text directly", () => {
    const text = "Does this change introduce mutable module-level state?";
    const q = buildQuestions([{ id: "simple", gate: false, text }]);
    assert.equal(q.pref_simple.instructions, `${text} Answer true only when the defined condition is visible in the supplied change.`);
  });

  it("gates only on an explicit gate condition crossing its threshold", () => {
    const v = judge(prefs, {
      pref_gate_one: { chance: 0.9 },
      pref_note_one: { chance: 0 },
    }, cfg);
    assert.equal(v.outcome, "fix_now");
    assert.equal(v.failures.length, 1);
  });

  it("advisories become notes, never failures", () => {
    const v = judge(prefs, {
      pref_gate_one: { chance: 0 },
      pref_note_one: { chance: 0.95 },
    }, cfg);
    assert.equal(v.outcome, "advisory");
    assert.deepEqual(v.failures, []);
    assert.equal(v.notes.length, 1);
  });

  it("approves clean diffs and tolerates missing answers as 0", () => {
    const v = judge(prefs, {}, cfg);
    assert.equal(v.outcome, "approve");
  });

  it("maps choice labels to outcomes in code and preserves confidence", () => {
    const choices = [{
      id: "api_change",
      type: "choice",
      question: "Classify the public API impact.",
      labels: { none: "No change", behavioral: "Behavior changes", breaking: "Incompatible" },
      outcomes: { none: "approve", behavioral: "advisory", breaking: "fix_now" },
    }];
    const q = buildQuestions(choices);
    assert.equal(q.pref_api_change.type, "choice");
    assert.deepEqual(q.pref_api_change.criteria, choices[0].labels);
    const v = judge(choices, {
      pref_api_change: {
        choice: "breaking",
        confidence: 0.8,
        probabilities: { none: 0.05, behavioral: 0.1, breaking: 0.85 },
      },
    }, cfg);
    assert.equal(v.outcome, "fix_now");
    assert.deepEqual(v.classifications[0], {
      id: "api_change", label: "breaking", probability: 0.85, confidence: 0.8, outcome: "fix_now",
    });
  });

  it("surfaces a lower-confidence gate label as advisory when thresholds differ", () => {
    const choices = [{
      id: "state_kind", type: "choice", question: "Classify state.",
      labels: { local: "Local", shared: "Shared mutable" },
      outcomes: { local: "approve", shared: "fix_now" },
    }];
    const v = judge(choices, {
      pref_state_kind: { choice: "shared", probabilities: { local: 0.35, shared: 0.65 } },
    }, cfg);
    assert.equal(v.outcome, "advisory");
    assert.match(v.notes[0], /uncertain gate/);
  });

  it("partitions hunk vs change scope with hunk default", () => {
    const { hunkPrefs, changePrefs } = partitionPrefs([
      { id: "a_one", scope: "change" },
      { id: "b_two" },
      { id: "c_three", scope: "hunk" },
    ]);
    assert.deepEqual(hunkPrefs.map((p) => p.id), ["b_two", "c_three"]);
    assert.deepEqual(changePrefs.map((p) => p.id), ["a_one"]);
    assert.equal(summarizePreference({ id: "a_one", scope: "change", gate: false, question: "Q?" }).scope, "change");
  });

  it("maps wire noul to display condition", () => {
    assert.equal(displayQuestionType("noul"), "condition");
    assert.equal(displayQuestionType("choice"), "choice");
    const q = buildQuestions([{ id: "c_one", gate: false, text: "Q?" }]);
    assert.equal(q.pref_c_one.type, "noul");
  });

  it("headlines findings with human names while keeping ids", () => {
    const named = [{ id: "no_any", name: "No any", gate: true, text: "No any." }];
    const v = judge(named, { pref_no_any: { chance: 0.9 } }, cfg);
    assert.match(v.failures[0], /No any \(no_any\) P=0\.90/);
    const choices = [{
      id: "api_change", name: "API change", type: "choice", question: "Classify.",
      labels: { none: "No change", breaking: "Incompatible" },
      outcomes: { none: "approve", breaking: "fix_now" },
    }];
    const vc = judge(choices, {
      pref_api_change: { choice: "breaking", confidence: 0.8, probabilities: { breaking: 0.85 } },
    }, cfg);
    assert.equal(vc.classifications[0].name, "API change");
    assert.match(vc.failures[0], /API change \(api_change\)=breaking/);
  });

  it("falls through to approve when the top choice label scores below cutoff", () => {
    const choices = [{
      id: "api_change",
      type: "choice",
      question: "Classify the public API impact.",
      labels: { none: "No change", breaking: "Incompatible" },
      outcomes: { none: "approve", breaking: "fix_now" },
    }];
    const v = judge(choices, {
      pref_api_change: {
        choice: "breaking",
        confidence: 0.9,
        probabilities: { none: 0.6, breaking: 0.4 },
      },
    }, cfg);
    assert.equal(v.outcome, "approve");
    assert.deepEqual(v.failures, []);
    assert.deepEqual(v.notes, []);
    assert.equal(v.classifications[0].label, "breaking");
  });
});

describe("secrets suite", () => {
  it("always gates on leaks", () => {
    const v = judgeSecrets({ sec_leak: { chance: 0.99 }, sec_pii: { chance: 0 } }, { gateThreshold: 0.7 });
    assert.equal(v.outcome, "fix_now");
    const clean = judgeSecrets({ sec_leak: { chance: 0.1 } }, { gateThreshold: 0.7 });
    assert.equal(clean.outcome, "approve");
  });

  it("batches without colliding with pref question ids", () => {
    const ids = new Set([...Object.keys(buildQuestions(prefs)), ...Object.keys(buildSecrets())]);
    assert.equal(ids.size, Object.keys(buildQuestions(prefs)).length + Object.keys(buildSecrets()).length);
  });
});
