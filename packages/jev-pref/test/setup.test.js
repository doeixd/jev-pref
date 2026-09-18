import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { inspectRepository, renderSetup, setup } from "../src/commands/setup.js";
import { renderSync, sync } from "../src/commands/sync.js";

function mockOut() {
  const logs = [];
  const errors = [];
  return { out: { log: (m) => logs.push(String(m)), error: (m) => errors.push(String(m)) }, logs, errors };
}

describe("setup bootstrap protocol", () => {
  it("inspects high-signal repository files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-setup-"));
    try {
      await writeFile(join(dir, "AGENTS.md"), "# Instructions\n");
      await writeFile(join(dir, "AGENT.md"), "# Alternate instructions\n");
      await writeFile(join(dir, "package.json"), "{}\n");
      await writeFile(join(dir, "jev-pref.json"), JSON.stringify({ suites: ["prefs"], prefs: [{ id: "one", gate: false, text: "One." }] }));
      await mkdir(join(dir, ".github", "workflows"), { recursive: true });
      await writeFile(join(dir, ".github", "workflows", "test.yml"), "name: test\n");

      const info = inspectRepository(dir);
      assert.deepEqual(info.sources, ["AGENTS.md", "AGENT.md"]);
      assert.equal(info.config.valid, true);
      assert.equal(info.config.prefCount, 1);
      assert.deepEqual(info.workflows, ["test.yml"]);
      assert.deepEqual(info.project, ["Node.js"]);
      assert.ok(info.auth.every(({ available }) => typeof available === "boolean"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints a bidirectional synchronization protocol without changing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-sync-"));
    try {
      const marker = join(dir, "keep.txt");
      await writeFile(marker, "unchanged\n");
      await writeFile(join(dir, "AGENTS.md"), "# Guidance\n");
      await writeFile(join(dir, "jev-pref.json"), JSON.stringify({ prefs: [{ id: "one", gate: false, text: "One." }] }));
      const { out, logs } = mockOut();
      assert.equal(await sync({ positional: [], flags: {} }, { cwd: dir, out }), 0);
      const text = logs.join("\n");
      assert.match(text, /reverse direction/);
      assert.match(text, /mechanically enforceable/);
      assert.match(text, /externally defined/);
      assert.match(text, /fixed user-defined taxonomy/);
      assert.match(text, /Do not make semantic policy changes without the user's agreement/);
      assert.equal(await readFile(marker, "utf8"), "unchanged\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("renders config ownership in sync instructions", () => {
    const text = renderSync({
      sources: ["AGENTS.md"],
      config: { exists: true, valid: true, prefCount: 2 },
      localConfig: { exists: true, valid: true, prefCount: 1 },
    });
    assert.match(text, /Shared policy.*2 preferences/);
    assert.match(text, /Personal policy.*1 preference/);
  });

  it("prints agent instructions without changing the repository", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-setup-"));
    try {
      const marker = join(dir, "keep.txt");
      await writeFile(marker, "unchanged\n");
      const { out, logs } = mockOut();
      assert.equal(await setup({ positional: [], flags: {} }, { cwd: dir, out }), 0);
      const text = logs.join("\n");
      assert.match(text, /ASK THE USER/);
      assert.match(text, /after a substantial bout of\s+coding work/);
      assert.match(text, /npx jev-pref examples review-script/);
      assert.match(text, /If you cannot explain what visible evidence/);
      assert.match(text, /DIRECT/);
      assert.match(text, /NEEDS SHAPING/);
      assert.match(text, /NOT FOR JEV/);
      assert.equal(await readFile(marker, "utf8"), "unchanged\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("renders invalid existing config as a problem to preserve and repair", () => {
    const text = renderSetup({
      root: "/repo", git: true, sources: [],
      config: { exists: true, valid: false }, workflows: [], project: [],
    });
    assert.match(text, /jev-pref\.json found but is not valid JSON/);
    assert.match(text, /Preserve useful existing setup/);
  });

  it("rejects positional arguments", async () => {
    const { out, errors } = mockOut();
    assert.equal(await setup({ positional: ["extra"], flags: {} }, { out }), 2);
    assert.match(errors.join("\n"), /takes no arguments/);
  });
});
