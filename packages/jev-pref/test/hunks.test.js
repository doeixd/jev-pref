import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hunkLabel, splitFiles, splitHunks } from "../src/hunks.js";

const DIFF = [
  "diff --git a/a.ts b/a.ts",
  "index 111..222 100644",
  "--- a/a.ts",
  "+++ b/a.ts",
  "@@ -1,3 +1,4 @@ ctx",
  " keep",
  "-old",
  "+new1",
  "+new2",
  " keep",
  "@@ -10,2 +11,3 @@",
  " x",
  "+y",
  "diff --git a/old.ts b/new.ts",
  "similarity index 90% 100%",
  "rename from old.ts",
  "rename to new.ts",
  "--- a/old.ts",
  "+++ b/new.ts",
  "@@ -5,2 +5,2 @@",
  " a",
  "-b",
  "+c",
  "diff --git a/gone.ts b/gone.ts",
  "deleted file mode 100644",
  "--- a/gone.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-a",
  "-b",
  'diff --git "a/my file.ts" "b/my file.ts"',
  "new file mode 100644",
  "--- /dev/null",
  '+++ "b/my file.ts"',
  "@@ -0,0 +1,2 @@",
  "+l1",
  "+l2",
].join("\n");

describe("splitHunks", () => {
  it("splits per file and hunk with new-side ranges", () => {
    const h = splitHunks(DIFF);
    assert.equal(h.length, 5);
    assert.deepEqual([h[0].file, h[0].start, h[0].count], ["a.ts", 1, 4]);
    assert.deepEqual([h[1].file, h[1].start, h[1].count], ["a.ts", 11, 3]);
    assert.equal(h[0].body.split("\n")[0], "@@ -1,3 +1,4 @@ ctx");
  });

  it("follows renames to the new name", () => {
    const h = splitHunks(DIFF);
    assert.equal(h[2].file, "new.ts");
    assert.equal(hunkLabel(h[2]), "new.ts:5-6");
  });

  it("handles pure deletions (count 0) without negative labels", () => {
    const h = splitHunks(DIFF);
    assert.equal(h[3].count, 0);
    assert.equal(hunkLabel(h[3]), "gone.ts:0-0");
  });

  it("handles quoted paths with spaces", () => {
    const h = splitHunks(DIFF);
    assert.equal(h[4].file, "my file.ts");
    assert.equal(hunkLabel(h[4]), "my file.ts:1-2");
  });

  it("returns [] for empty diffs", () => {
    assert.deepEqual(splitHunks(""), []);
    assert.deepEqual(splitHunks("nothing here\n"), []);
  });
});

describe("splitFiles", () => {
  it("keeps complete file diffs and follows the new rename path", () => {
    const diff = [
      "diff --git a/a.js b/a.js", "--- a/a.js", "+++ b/a.js", "@@ -1 +1 @@", "-a", "+b",
      "diff --git a/old.js b/new.js", "similarity index 90%", "--- a/old.js", "+++ b/new.js", "@@ -1 +1 @@", "-x", "+y",
    ].join("\n");
    const files = splitFiles(diff);
    assert.deepEqual(files.map((f) => f.file), ["a.js", "new.js"]);
    assert.match(files[0].body, /@@ -1 \+1 @@/);
    assert.match(files[1].body, /similarity index/);
  });
});
