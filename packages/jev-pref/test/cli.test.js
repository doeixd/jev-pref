import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { run } from "../src/cli.js";

function mockOut() {
  const logs = [];
  const errors = [];
  return { out: { log: (m) => logs.push(String(m)), error: (m) => errors.push(String(m)) }, logs, errors };
}

describe("cli dispatcher", () => {
  it("loads all modules without syntax errors", async () => {
    const { out, logs } = mockOut();
    assert.equal(await run(["--version"], { out }), 0);
    assert.ok(logs[0].startsWith("jev-pref "));
  });

  it("serves per-command help", async () => {
    const { out, logs } = mockOut();
    assert.equal(await run(["help", "review"], { out }), 0);
    assert.ok(logs.join("\n").includes("--diff"));
    const r2 = mockOut();
    assert.equal(await run(["review", "--help"], { cwd: ".", out: r2.out }), 0);
  });

  it("rejects unknown commands and flags", async () => {
    const r1 = mockOut();
    assert.equal(await run(["bogus"], { out: r1.out }), 2);
    const r2 = mockOut();
    assert.equal(await run(["review", "--bogus"], { out: r2.out }), 2);
    assert.ok(r2.errors.join("\n").includes("unknown --bogus"));
  });
});
