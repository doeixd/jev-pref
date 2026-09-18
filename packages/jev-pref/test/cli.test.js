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
    const r3 = mockOut();
    assert.equal(await run(["setup", "--help"], { cwd: ".", out: r3.out }), 0);
    assert.ok(r3.logs.join("\n").includes("read-only") || r3.logs.join("\n").includes("does not"));
    const r4 = mockOut();
    assert.equal(await run(["sync", "--help"], { cwd: ".", out: r4.out }), 0);
    assert.match(r4.logs.join("\n"), /bidirectional/);
  });

  it("documents the evidence envelope, choice cutoffs, and cost model", async () => {
    const { out, logs } = mockOut();
    assert.equal(await run(["help", "review"], { out }), 0);
    const text = logs.join("\n");
    assert.match(text, /Evidence envelope/);
    assert.match(text, /Filenames ARE visible/);
    assert.match(text, /noul/);
    assert.match(text, /falls through to approve/);
    assert.match(text, /choice[\s\S]*fix_now|fix_now[\s\S]*choice/);
    assert.match(text, /Cost model/);
    const t = mockOut();
    assert.equal(await run(["help", "tune"], { out: t.out }), 0);
    assert.match(t.logs.join("\n"), /0\.5.*0\.9/);
    assert.match(t.logs.join("\n"), /threshold-independent/);
  });

  it("documents raw observation mode", async () => {
    const { out, logs } = mockOut();
    assert.equal(await run(["help", "review"], { out }), 0);
    assert.match(logs.join("\n"), /--raw/);
    assert.match(logs.join("\n"), /no verdict/);
  });

  it("prints the sync protocol", async () => {
    const { out, logs } = mockOut();
    assert.equal(await run(["sync"], { cwd: ".", out }), 0);
    assert.match(logs.join("\n"), /living preference contract/);
  });

  it("keeps init as a non-writing migration alias", async () => {
    const { out, logs } = mockOut();
    assert.equal(await run(["init"], { out }), 0);
    assert.match(logs.join("\n"), /npx jev-pref setup/);
    assert.match(logs.join("\n"), /No files were changed/);
  });

  it("lists and prints integration examples", async () => {
    const list = mockOut();
    assert.equal(await run(["examples"], { out: list.out }), 0);
    assert.match(list.logs.join("\n"), /review-script/);
    const recipe = mockOut();
    assert.equal(await run(["examples", "agent-loop"], { out: recipe.out }), 0);
    assert.match(recipe.logs.join("\n"), /substantial bout/);
  });

  it("rejects unknown commands and flags", async () => {
    const r1 = mockOut();
    assert.equal(await run(["bogus"], { out: r1.out }), 2);
    const r2 = mockOut();
    assert.equal(await run(["review", "--bogus"], { out: r2.out }), 2);
    assert.ok(r2.errors.join("\n").includes("unknown --bogus"));
  });
});
