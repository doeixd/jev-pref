import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildQuestions, judge } from "../src/suites/prefs.js";
import { buildQuestions as buildSecrets, judge as judgeSecrets } from "../src/suites/secrets.js";

const prefs = [
  { id: "gate_one", gate: true, text: "Gate." },
  { id: "note_one", gate: false, text: "Note." },
];
const cfg = { gateThreshold: 0.7, advisoryThreshold: 0.7, severityFail: 1.5 };

describe("prefs suite", () => {
  it("namespaces one noul per pref plus severity/next", () => {
    const q = buildQuestions(prefs);
    assert.ok(q.pref_gate_one && q.pref_note_one && q.pref_severity && q.pref_next);
  });

  it("gates on gate violations; next never overrides a gate", () => {
    const v = judge(prefs, {
      pref_gate_one: { chance: 0.9 },
      pref_note_one: { chance: 0 },
      pref_severity: { score: 0 },
      pref_next: { choice: "approve" }, // model disagrees — gate still wins
    }, cfg);
    assert.equal(v.outcome, "fix_now");
    assert.equal(v.failures.length, 1);
  });

  it("advisories become notes, never failures", () => {
    const v = judge(prefs, {
      pref_gate_one: { chance: 0 },
      pref_note_one: { chance: 0.95 },
      pref_severity: { score: 1 },
      pref_next: { choice: "advisory" },
    }, cfg);
    assert.equal(v.outcome, "advisory");
    assert.deepEqual(v.failures, []);
    assert.equal(v.notes.length, 1);
  });

  it("approves clean diffs and tolerates missing answers as 0", () => {
    const v = judge(prefs, {}, cfg);
    assert.equal(v.outcome, "approve");
  });

  it("severity forces fix_now even without a gate hit", () => {
    const v = judge(prefs, {
      pref_gate_one: { chance: 0 },
      pref_severity: { score: 2 },
      pref_next: { choice: "other" },
    }, cfg);
    assert.equal(v.outcome, "fix_now");
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
