import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { commentBody, globToRegExp, normalizeVerdict, splitList } from "../../../actions/review/scripts/review-pr.js";
import { assertSafeRef, SAFE_REF, UnsafeRefError } from "../src/git.js";

describe("git ref safety", () => {
  it("accepts refs and ranges", () => {
    for (const r of ["HEAD", "HEAD~3", "main...HEAD", "origin/main", "v1.2.3", "abc123^{}"]) {
      assert.ok(SAFE_REF.test(r), r);
      assert.doesNotThrow(() => assertSafeRef(r));
    }
  });

  it("rejects shell metachars and option-like refs", () => {
    for (const r of ["--staged", "-h", "a;b", "$(x)", "`x`", "a b", "a|b", "a&b", "a>out"]) {
      assert.throws(() => assertSafeRef(r), UnsafeRefError, r);
    }
  });
});

describe("action driver units", () => {
  it("keeps YAML plain scalars free of unquoted mapping separators", () => {
    const manifest = readFileSync(new URL("../../../actions/review/action.yml", import.meta.url), "utf8");
    for (const [index, line] of manifest.split(/\r?\n/).entries()) {
      const value = line.match(/^\s+[A-Za-z0-9_-]+:\s+(.+)$/)?.[1];
      if (!value || value.startsWith('"') || value.startsWith("'")) continue;
      assert.doesNotMatch(value, /:\s/, `line ${index + 1} needs quotes around its YAML scalar`);
    }
  });

  it("splitList handles csv + newlines", () => {
    assert.deepEqual(splitList("a,b\nc\nd"), ["a", "b", "c", "d"]);
  });

  it("glob matches **, *, ?", () => {
    assert.ok(globToRegExp("**/*.ts").test("src/a/b.ts"));
    assert.ok(!globToRegExp("*.ts").test("src/a.ts"));
    assert.ok(globToRegExp("src/??.ts").test("src/ab.ts"));
  });

  it("normalizeVerdict passes whole-diff shapes through", () => {
    const v = normalizeVerdict({ outcome: "fix_now", suites: [{ suite: "prefs", outcome: "fix_now", failures: ["x"], notes: [] }], files: ["a"] });
    assert.equal(v.suites.length, 1);
    assert.deepEqual(v.files, ["a"]);
  });

  it("normalizeVerdict aggregates hunk shapes with labels", () => {
    const v = normalizeVerdict({
      outcome: "fix_now",
      hunks: [
        { label: "a.ts:1-3", outcome: "fix_now", suites: [{ suite: "prefs", outcome: "fix_now", failures: ["bad"], notes: [] }] },
        { label: "b.ts:5-6", outcome: "approve", suites: [{ suite: "prefs", outcome: "approve", failures: [], notes: [] }] },
      ],
      files: ["a.ts", "b.ts"],
    });
    assert.equal(v.outcome, "fix_now");
    assert.equal(v.suites.length, 1);
    assert.ok(v.suites[0].failures[0].startsWith("[a.ts:1-3]"));
    assert.equal(v.suites[0].outcome, "fix_now");
  });

  it("normalizeVerdict aggregates file scopes", () => {
    const v = normalizeVerdict({
      outcome: "advisory",
      scopes: [
        { label: "src/a.ts", outcome: "advisory", suites: [{ suite: "prefs", outcome: "advisory", failures: [], notes: ["consider x"] }] },
      ],
      files: ["src/a.ts"],
    });
    assert.equal(v.outcome, "advisory");
    assert.equal(v.suites[0].notes[0], "[src/a.ts] consider x");
  });

  it("keeps fixed classifications and their scope in Action comments", () => {
    const v = normalizeVerdict({
      outcome: "approve",
      scopes: [{
        label: "src/api.ts",
        outcome: "approve",
        suites: [{
          suite: "prefs", outcome: "approve", failures: [], notes: [],
          classifications: [{ id: "api_change", label: "additive", probability: 0.91, confidence: 0.82, outcome: "approve" }],
        }],
      }],
      files: ["src/api.ts"],
    });
    assert.equal(v.suites[0].classifications[0].scope, "src/api.ts");
    const body = commentBody({ outcome: v.outcome, suites: v.suites, base: "abc", head: "def", runUrl: "" });
    assert.match(body, /\[src\/api\.ts\] api_change=additive P=0\.91 confidence=0\.82 → approve/);
  });

  it("omits unlabeled condition classifications from Action comments", () => {
    const v = normalizeVerdict({
      outcome: "approve",
      scopes: [{
        label: "src/a.ts",
        outcome: "approve",
        suites: [{
          suite: "prefs", outcome: "approve", failures: [], notes: [],
          classifications: [{ id: "no_keys", probability: 0.02, outcome: "advisory" }],
        }],
      }],
      files: ["src/a.ts"],
    });
    const body = commentBody({ outcome: v.outcome, suites: v.suites, base: "abc", head: "def", runUrl: "" });
    assert.doesNotMatch(body, /undefined/);
    assert.match(body, /_clean_/);
  });

  it("commentBody truncates to GitHub limits", () => {
    const big = Array.from({ length: 5000 }, (_, i) => `failure number ${i} with padding xxxxxxxxxx`);
    const body = commentBody({
      outcome: "fix_now",
      suites: [{ suite: "prefs", outcome: "fix_now", failures: big, notes: [] }],
      base: "abc", head: "def", runUrl: "",
    });
    assert.ok(body.length <= 60100);
    assert.ok(body.includes("jev-pref: fix_now"));
  });
});
