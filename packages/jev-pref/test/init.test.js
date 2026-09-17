import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { init } from "../src/commands/init.js";

function out() {
  const lines = [];
  return { out: { log: (m) => lines.push(m), error: (m) => lines.push(`ERR: ${m}`) }, lines };
}

const yesFlags = (extra = {}) => ({
  yes: true, stack: "gateway", scope: "working-tree", suites: "prefs",
  trigger: "after every task", wire: "none", ...extra,
});

describe("init overwrite guard", () => {
  it("refuses to wipe existing prefs without --force", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-init-"));
    try {
      const before = JSON.stringify({ suites: ["prefs"], prefs: [{ id: "keep_me", gate: true, text: "Keep." }] });
      await (await import("node:fs/promises")).writeFile(join(dir, "jev-pref.json"), before);
      const { out: o, lines } = out();
      const code = await init({ flags: yesFlags() }, { cwd: dir, out: o });
      assert.equal(code, 2);
      assert.ok(lines.some((l) => l.includes("--force")));
      assert.equal(await readFile(join(dir, "jev-pref.json"), "utf8"), before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("overwrites with --force and writes fresh configs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-init-"));
    try {
      const { out: o1 } = out();
      assert.equal(await init({ flags: yesFlags() }, { cwd: dir, out: o1 }), 0);
      const written = JSON.parse(await readFile(join(dir, "jev-pref.json"), "utf8"));
      assert.deepEqual(written.prefs, []);
      const { out: o2 } = out();
      assert.equal(await init({ flags: yesFlags({ force: true }) }, { cwd: dir, out: o2 }), 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
