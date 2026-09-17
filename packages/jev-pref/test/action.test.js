import assert from "node:assert/strict";
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
