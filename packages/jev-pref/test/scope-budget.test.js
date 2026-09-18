import assert from "node:assert/strict";
import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { review } from "../src/commands/review.js";

const execFile = promisify(execFileCb);

function mockOut() {
  const logs = [];
  const errors = [];
  return { out: { log: (m) => logs.push(String(m)), error: (m) => errors.push(String(m)) }, logs, errors };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "jev-scopes-"));
  await execFile("git", ["init"], { cwd: dir });
  await execFile("git", ["config", "user.email", "test@example.invalid"], { cwd: dir });
  await execFile("git", ["config", "user.name", "Test"], { cwd: dir });
  await writeFile(join(dir, "jev-pref.json"), JSON.stringify({
    suites: ["prefs"],
    prefs: [{ id: "focused", gate: false, text: "Does this change introduce unrelated behavior?" }],
  }));
  await writeFile(join(dir, "a.js"), "export const a = 1;\n");
  await writeFile(join(dir, "b.js"), "export const b = 1;\n");
  await execFile("git", ["add", "."], { cwd: dir });
  await execFile("git", ["commit", "-m", "base"], { cwd: dir });
  await writeFile(join(dir, "a.js"), `export const a = ${JSON.stringify("a".repeat(180))};\n`);
  await writeFile(join(dir, "b.js"), `export const b = ${JSON.stringify("b".repeat(180))};\n`);
  return dir;
}

describe("review request budgeting", () => {
  it("fails whole-diff review instead of approving a truncated prefix", async () => {
    const dir = await fixture();
    try {
      const { out, errors } = mockOut();
      const code = await review({ flags: { "dry-run": true, "max-diff-chars": "120" } }, { cwd: dir, out });
      assert.equal(code, 2);
      assert.match(errors.join("\n"), /partial diffs are not treated as approval/);
      assert.match(errors.join("\n"), /30k-token/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("splits per-file review into bounded requests", async () => {
    const dir = await fixture();
    try {
      const { out, logs } = mockOut();
      const code = await review({
        flags: { "dry-run": true, files: true, "max-diff-chars": "120", "max-hunks": "20" },
      }, { cwd: dir, out });
      assert.equal(code, 0);
      const preview = JSON.parse(logs.at(-1));
      assert.equal(preview.granularity, "files");
      assert.ok(preview.scopes.length > 2);
      assert.ok(preview.scopes.every((scope) => scope.state.diff.length <= 120));
      assert.ok(preview.scopes.some((scope) => scope.label.includes("part")));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails scoped overflow instead of falling back to a whole diff", async () => {
    const dir = await fixture();
    try {
      const { out, errors } = mockOut();
      const code = await review({
        flags: { "dry-run": true, files: true, "max-hunks": "1" },
      }, { cwd: dir, out });
      assert.equal(code, 2);
      assert.match(errors.join("\n"), /will not collapse scoped review/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not duplicate untracked content into a tracked file scope", async () => {
    const dir = await fixture();
    try {
      await writeFile(join(dir, "new.js"), "export const fresh = true;\n");
      const { out, logs } = mockOut();
      const code = await review({
        flags: { "dry-run": true, files: true, "max-hunks": "20" },
      }, { cwd: dir, out });
      assert.equal(code, 0);
      const preview = JSON.parse(logs.at(-1));
      const tracked = preview.scopes.find((scope) => scope.file === "b.js");
      const untracked = preview.scopes.find((scope) => scope.file === "new.js");
      assert.ok(tracked);
      assert.ok(untracked);
      assert.doesNotMatch(tracked.state.diff, /new file: new\.js/);
      assert.match(untracked.state.diff, /fresh = true/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails when an untracked text file cannot fit the collection budget", async () => {
    const dir = await fixture();
    try {
      await writeFile(join(dir, "new.js"), "x".repeat(200));
      const { out, errors } = mockOut();
      const code = await review({
        flags: { "dry-run": true, "max-diff-chars": "120" },
      }, { cwd: dir, out });
      assert.equal(code, 2);
      assert.match(errors.join("\n"), /review input is incomplete/);
      assert.match(errors.join("\n"), /incomplete input is not approval/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
