import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { DEFAULTS, extractFencedBlock, resolveConfig, validateConfig } from "../src/config.js";

const ENV_KEYS = ["JEV_SUITES", "JEV_GATE_THRESHOLD", "JEV_HUNKS", "JEV_CONFIG"];
const savedEnv = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const goodPrefs = [{ id: "no_any", gate: true, text: "No any." }];

function valid(over = {}) {
  return { ...structuredClone(DEFAULTS), prefs: goodPrefs, ...over };
}

describe("validateConfig", () => {
  it("accepts a valid config", () => {
    assert.deepEqual(validateConfig(valid()), []);
  });

  it("rejects bad thresholds, suites, and dup ids", () => {
    assert.ok(validateConfig(valid({ gateThreshold: 2 })).length > 0);
    assert.ok(validateConfig(valid({ suites: [] })).some((e) => e.includes("suites")));
    assert.ok(validateConfig(valid({ prefs: [...goodPrefs, ...goodPrefs] })).some((e) => e.includes("duplicate")));
    assert.ok(validateConfig(valid({ provider: "nope" })).some((e) => e.includes("provider")));
    assert.ok(validateConfig(valid({ agent: { command: [] } })).some((e) => e.includes("agent.command")));
    assert.ok(validateConfig(valid({ agent: { command: ["x"], on: [] } })).some((e) => e.includes("agent.on")));
  });
});

describe("extractFencedBlock", () => {
  it("returns undefined when absent", () => {
    assert.equal(extractFencedBlock("# hello\n"), undefined);
  });

  it("parses the first block", () => {
    const md = "a\n```jev-prefs\n{\"suites\":[\"prefs\"]}\n```\nb";
    assert.deepEqual(extractFencedBlock(md), { suites: ["prefs"] });
  });

  it("throws on present-but-broken JSON", () => {
    assert.throws(() => extractFencedBlock("```jev-prefs\n{nope}\n```"), /invalid JSON/);
  });
});

describe("resolveConfig", () => {
  it("merges flags > env > json > fenced > defaults and reports ignored keys", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
    try {
      await writeFile(join(dir, "jev-pref.json"), JSON.stringify({
        gateThreshold: 0.5,
        gateTreshold: 0.9, // typo — must be reported, not applied
        $schema: "https://example/schema.json",
        prefs: goodPrefs,
      }));
      await writeFile(join(dir, "CLAUDE.md"), "x\n```jev-prefs\n{\"advisoryThreshold\": 0.6}\n```\n");
      process.env.JEV_SUITES = "prefs,secrets";
      const { config, sources, ignored } = await resolveConfig({
        rootDir: dir,
        flags: { gateThreshold: 0.8 },
      });
      assert.equal(config.gateThreshold, 0.8); // flags win
      assert.equal(sources.gateThreshold, "flags");
      assert.deepEqual(config.suites, ["prefs", "secrets"]); // env
      assert.equal(config.advisoryThreshold, 0.6); // fenced
      assert.deepEqual(ignored.json, ["gateTreshold"]);
      assert.deepEqual(ignored.fenced, []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails loud on broken json and missing explicit paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
    try {
      await writeFile(join(dir, "jev-pref.json"), "{broken");
      await assert.rejects(resolveConfig({ rootDir: dir, flags: {} }), /invalid JSON/);
      await assert.rejects(
        resolveConfig({ rootDir: dir, flags: { config: join(dir, "nope.json") } }),
        /config not found/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails loud on a broken fenced block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
    try {
      await writeFile(join(dir, "CLAUDE.md"), "```jev-prefs\n{broken}\n```\n");
      await assert.rejects(resolveConfig({ rootDir: dir, flags: {} }), /invalid JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
