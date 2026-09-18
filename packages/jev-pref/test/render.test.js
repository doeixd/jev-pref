import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderRaw, renderVerdict } from "../src/commands/review.js";

const fix = [{ suite: "prefs", outcome: "fix_now", failures: ["no_any P=0.92 bad"], notes: [] }];
const ok = [{ suite: "prefs", outcome: "approve", failures: [], notes: [] }];

describe("renderVerdict", () => {
  it("renders whole-diff verdicts as non-empty text", () => {
    const t = renderVerdict(fix);
    assert.match(t, /fix_now/);
    assert.match(t, /no_any/);
    assert.equal(renderVerdict(ok), "approve (suites: prefs=approve)");
  });

  it("renders scoped hunk blocks with labels (regression: b.text join)", () => {
    // Every block must be a non-empty string — joining must never produce
    // blank separators (once shipped `[undefined].join()` blanks).
    const blocks = ["a.ts:1-3", "b.ts:5-6"].map((label) => renderVerdict(fix, label));
    for (const b of blocks) {
      assert.equal(typeof b, "string");
      assert.ok(b.length > 0);
    }
    const text = `fix_now (2 hunks)\n${blocks.join("\n")}`;
    assert.match(text, /\[a\.ts:1-3\]/);
    assert.match(text, /\[b\.ts:5-6\]/);
    assert.ok(!text.includes("undefined"));
  });

  it("renders fixed classifications even when their mapped outcome approves", () => {
    const verdict = [{
      suite: "prefs", outcome: "approve", failures: [], notes: [],
      classifications: [{ id: "api_change", label: "additive", probability: 0.9, confidence: 0.8, outcome: "approve" }],
    }];
    const text = renderVerdict(verdict);
    assert.match(text, /api_change=additive/);
    assert.match(text, /confidence=0\.80 -> approve/);
  });

  it("counts advisories in heads instead of clean approve", () => {
    const advisory = [{ suite: "prefs", outcome: "advisory", failures: [], notes: ["a P=0.80 q"] }];
    assert.match(renderVerdict(advisory), /advisory \(1 advisory/);
    const subThreshold = [{
      suite: "prefs", outcome: "approve", failures: [], notes: [],
      classifications: [{ id: "api_change", label: "behavioral", probability: 0.5, confidence: 0.9, outcome: "advisory" }],
    }];
    assert.match(renderVerdict(subThreshold), /approve with 1 advisory/);
  });

  it("renders raw probabilities with an intro and per-line cutoffs", () => {
    const text = renderRaw([{
      label: "a.ts:1-3",
      results: [
        { id: "gate_one", name: "Gate one", kind: "condition", scope: "hunk", question: "Gate?", probability: 0.9, gate: true, cutoff: 0.7, suite: "prefs" },
        { id: "api_change", kind: "choice", scope: "hunk", question: "Classify.", label: "breaking", probability: 0.85, confidence: 0.8, outcomes: { breaking: "fix_now" }, cutoff: 0.7, suite: "prefs" },
      ],
    }], { gateThreshold: 0.7, advisoryThreshold: 0.6 });
    assert.match(text, /no verdict applied/);
    assert.match(text, /Gate one \(gate_one\) P=0\.90 cutoff=0\.70 gate/);
    assert.match(text, /api_change=breaking P=0\.85 confidence=0\.80 cutoff=0\.70/);
    assert.doesNotMatch(text, /^(approve|advisory|fix_now)\b/m);
  });
});
