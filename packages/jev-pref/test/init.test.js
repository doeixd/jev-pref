import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";import { describe, it } from "node:test";
import { Readable } from "node:stream";
import { buildPlan, init, runFlow, validateAnswers } from "../src/commands/init.js";
import { SUITES } from "../src/commands/review.js";

function out() {
  const lines = [];
  return { out: { log: (m) => lines.push(m), error: (m) => lines.push(`ERR: ${m}`) }, lines };
}

const yesFlags = (extra = {}) => ({
  yes: true, stack: "gateway", scope: "working-tree", suites: "prefs",
  trigger: "after every task", wire: "none", ...extra,
});

describe("init answer validation", () => {
  it("rejects unknown and empty suites in --yes mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-init-"));
    try {
      const { out: o, lines } = out();
      assert.equal(await init({ flags: yesFlags({ suites: "prefs,nope" }) }, { cwd: dir, out: o }), 2);
      assert.ok(lines.some((l) => l.includes("unknown suites")));
      assert.equal(await init({ flags: yesFlags({ suites: " , " }) }, { cwd: dir, out: o }), 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stays in sync with the engine's suite registry", () => {
    assert.deepEqual(Object.keys(SUITES).sort(), ["prefs", "secrets"]);
  });

  it("validateAnswers catches every bad answer at once", () => {
    const errors = validateAnswers({
      stack: "nope", scope: "nope", wire: "nope", suites: ["prefs", "nope"],
      trigger: "  ", agentCmd: "   ",
    });
    assert.equal(errors.length, 6);
  });

  it("buildPlan derives the wired command and targets", () => {
    const plan = buildPlan({
      stack: "gateway", scope: "staged", wire: "claude", suites: ["prefs"],
      trigger: "after every task", hunks: true, agentCmd: undefined, outPath: "jev-pref.json",
    }, "/repo");
    assert.ok(plan.reviewCmd.includes("--staged") && plan.reviewCmd.includes("--hunks"));
    assert.deepEqual(plan.targets, [join("/repo", "CLAUDE.md")]);
  });
});

describe("runFlow", () => {
  // Scripted ask (no streams): shift scripted answers, echo nothing.
  const scripted = (answers) => {
    const q = [...answers];
    return async (prompt, def) => {
      if (q.length === 0) throw new Error("out of answers");
      const raw = q.shift().trim();
      return raw === "" ? def : raw;
    };
  };

  it("collects answers with defaults and flag overlays", async () => {
    const { out: o, lines } = out();
    const answers = await runFlow(scripted(["", "", "", "", "", "", "", ""]), o, { interactive: true, flags: {}, cwd: "." });
    assert.equal(answers.stack, "gateway");
    assert.equal(answers.scope, "working-tree");
    assert.deepEqual(answers.suites, ["prefs"]);
    assert.equal(answers.hunks, false);
    assert.equal(answers.agentCmd, undefined);
  });

  it("re-asks bad enums interactively, throws in batch", async () => {
    const { out: o, lines } = out();
    const answers = await runFlow(scripted(["bogus", "direct", "", "", "", "", "", "", ""]), o, { interactive: true, flags: {}, cwd: "." });
    assert.equal(answers.stack, "direct");
    assert.ok(lines.some((l) => l.includes("pick one of")));
    await assert.rejects(
      runFlow(scripted(["bogus"]), o, { interactive: false, flags: {}, cwd: "." }),
      /stack.*pick one of/,
    );
  });

  it("flag-given answers skip their questions", async () => {
    const { out: o } = out();
    // agent-cmd + hunks + wire flags set: only stack/scope/suites/trigger/outPath asked.
    const answers = await runFlow(
      scripted(["gateway", "working-tree", "prefs", "after every task", "jev-pref.json"]),
      o,
      { interactive: true, flags: { hunks: true, "agent-cmd": "claude -p" }, cwd: ".", skip: new Set(["wire"]) },
    );
    assert.equal(answers.hunks, true);
    assert.equal(answers.agentCmd, "claude -p");
    assert.equal(answers.outPath, "jev-pref.json");
  });
});

describe("init piped mode", () => {
  // Order: stack, scope, suites, trigger, wire, hunks, agentCmd, outPath, confirm.
  const piped = (lines) => Readable.from(lines.map((l) => `${l}\n`));

  it("writes on explicit yes and aborts on no", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-init-"));
    try {
      const base = ["gateway", "staged", "prefs", "after every task", "none", "no", "", "jev-pref.json"];
      const { out: o1, lines: l1 } = out();
      assert.equal(await init({ flags: {} }, { cwd: dir, out: o1, input: piped([...base, "yes"]) }), 0);
      const written = JSON.parse(await readFile(join(dir, "jev-pref.json"), "utf8"));
      assert.deepEqual(written.suites, ["prefs"]);
      assert.ok(l1.some((l) => l.includes("Next:")));

      const dir2 = await mkdtemp(join(tmpdir(), "jev-init-"));
      const { out: o2, lines: l2 } = out();
      assert.equal(await init({ flags: {} }, { cwd: dir2, out: o2, input: piped([...base, "no"]) }), 0);
      assert.ok(l2.some((l) => l.includes("nothing written")));
      await assert.rejects(readFile(join(dir2, "jev-pref.json"), "utf8"));
      await rm(dir2, { recursive: true, force: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails fast on truncated input instead of hanging", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-init-"));
    try {
      const { out: o, lines } = out();
      const code = await init({ flags: {} }, { cwd: dir, out: o, input: piped(["gateway"]) });
      assert.equal(code, 2);
      assert.ok(lines.some((l) => l.includes("input ended")));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("init overwrite guard", () => {
  it("refuses to wipe existing prefs without --force", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-init-"));
    try {
      const before = JSON.stringify({ suites: ["prefs"], prefs: [{ id: "keep_me", gate: true, text: "Keep." }] });
      await writeFile(join(dir, "jev-pref.json"), before);
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

  it("--print shows both the config file and the fence block", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-init-"));
    try {
      const { out: o, lines } = out();
      const code = await init({ flags: { ...yesFlags(), print: true } }, { cwd: dir, out: o });
      assert.equal(code, 0);
      const all = lines.join("\n");
      assert.ok(all.includes("jev-pref.json"));
      assert.ok(all.includes("```jev-prefs"));
      assert.ok(all.includes("## Preference review"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
