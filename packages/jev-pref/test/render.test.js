import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderVerdict } from "../src/commands/review.js";

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
});
