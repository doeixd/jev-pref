import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { DEFAULTS, extractFencedBlock, resolveConfig, validateConfig } from "../src/config.js";

const ENV_KEYS = ["JEV_SUITES", "JEV_GATE_THRESHOLD", "JEV_HUNKS", "JEV_FILES", "JEV_CONFIG"];
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
    assert.ok(validateConfig(valid({ hunks: true, files: true })).some((e) => e.includes("must not both")));
  });

  it("validates evidence conditions and fixed choice taxonomies", () => {
    const choice = {
      id: "api_change",
      type: "choice",
      question: "Classify the public API impact.",
      labels: { none: "No change", breaking: "Incompatible change" },
      outcomes: { none: "approve", breaking: "fix_now" },
    };
    assert.deepEqual(validateConfig(valid({ prefs: [choice] })), []);
    assert.ok(validateConfig(valid({ prefs: [{ ...choice, gate: true }] })).some((e) => e.includes("gate is not used")));
    assert.ok(validateConfig(valid({ prefs: [{ ...choice, outcomes: { none: "approve" } }] })).some((e) => e.includes("exactly match")));
    assert.ok(validateConfig(valid({ prefs: [{ id: "vague", gate: false }] })).some((e) => e.includes("needs a non-empty question")));
  });

  it("validates hunk|change scope and defaults to hunk", async () => {
    const { prefScope } = await import("../src/suites/prefs.js");
    assert.equal(prefScope({ id: "x" }), "hunk");
    assert.equal(prefScope({ id: "x", scope: "change" }), "change");
    assert.deepEqual(validateConfig(valid({ prefs: [{ ...goodPrefs[0], scope: "change" }] })), []);
    assert.ok(validateConfig(valid({ prefs: [{ ...goodPrefs[0], scope: "whole" }] })).some((e) => e.includes("scope must be hunk|change")));
  });

  it("validates optional human name and description", () => {
    assert.deepEqual(validateConfig(valid({ prefs: [{ ...goodPrefs[0], name: "No any", description: "No explicit any." }] })), []);
    assert.ok(validateConfig(valid({ prefs: [{ ...goodPrefs[0], name: "" }] })).some((e) => e.includes("name must be")));
    assert.ok(validateConfig(valid({ prefs: [{ ...goodPrefs[0], description: "" }] })).some((e) => e.includes("description must be")));
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
  it("merges flags > env > project json > fenced > defaults and reports ignored keys", async () => {
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

  it("merges local prefs by id and lets local settings override project settings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
    try {
      await writeFile(join(dir, "jev-pref.json"), JSON.stringify({
        gateThreshold: 0.7,
        hunks: false,
        prefs: [
          { id: "shared", gate: true, text: "Shared rule." },
          { id: "overridden", gate: false, text: "Project wording." },
        ],
      }));
      await writeFile(join(dir, "jev-pref.local.json"), JSON.stringify({
        gateThreshold: 0.8,
        hunks: false,
        localOnlyTypo: true,
        prefs: [
          { id: "overridden", gate: false, text: "Personal wording." },
          { id: "personal", gate: false, text: "Personal rule." },
        ],
      }));

      process.env.JEV_HUNKS = "true";
      const result = await resolveConfig({ rootDir: dir, flags: {} });
      assert.equal(result.config.gateThreshold, 0.8);
      assert.equal(result.sources.gateThreshold, "local");
      assert.equal(result.config.hunks, true);
      assert.equal(result.sources.hunks, "env");
      assert.deepEqual(result.config.prefs.map((p) => p.id), ["shared", "overridden", "personal"]);
      assert.equal(result.config.prefs[1].text, "Personal wording.");
      assert.equal(result.sources.prefs, "project+local");
      assert.equal(result.localConfigFound, true);
      assert.equal(result.localConfigPath, join(dir, "jev-pref.local.json"));
      assert.deepEqual(result.ignored.local, ["localOnlyTypo"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports a standalone personal config", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const git = promisify(execFile);
    const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
    try {
      await git("git", ["init"], { cwd: dir });
      await writeFile(join(dir, "jev-pref.local.json"), JSON.stringify({ prefs: goodPrefs }));
      const { config, localConfigFound, localConfigPath } = await resolveConfig({ rootDir: join(dir), flags: {} });
      assert.deepEqual(config.prefs, goodPrefs);
      assert.equal(localConfigFound, true);
      assert.equal(localConfigPath, join(dir, "jev-pref.local.json"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails loud on a broken local config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
    try {
      await writeFile(join(dir, "jev-pref.json"), JSON.stringify({ prefs: goodPrefs }));
      await writeFile(join(dir, "jev-pref.local.json"), "{broken");
      await assert.rejects(resolveConfig({ rootDir: dir, flags: {} }), /invalid JSON.*jev-pref\.local\.json/);
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

  it("walks up to the git root for configs and fenced blocks", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const git = promisify(execFile);
    const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
    try {
      await git("git", ["init"], { cwd: dir });
      await writeFile(join(dir, "jev-pref.json"), JSON.stringify({ gateThreshold: 0.55, prefs: goodPrefs }));
      const { mkdir } = await import("node:fs/promises");
      const sub = join(dir, "packages", "app");
      await mkdir(sub, { recursive: true });
      const { config, configPath } = await resolveConfig({ rootDir: sub, flags: {} });
      assert.equal(config.gateThreshold, 0.55); // found by walking up
      assert.equal(configPath, join(dir, "jev-pref.json"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stays root-local outside git", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
    try {
      const { config, sources } = await resolveConfig({ rootDir: dir, flags: {} });
      assert.equal(sources.gateThreshold, "defaults");
      assert.deepEqual(config.suites, ["prefs"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
