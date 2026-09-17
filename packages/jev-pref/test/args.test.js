import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boolFlag, intFlag, InvalidArgs, listFlag, numFlag, parseArgs, strFlag } from "../src/args.js";

describe("parseArgs", () => {
  it("splits command, positionals, and flags", () => {
    const p = parseArgs(["review", "--diff", "HEAD~1", "--json"]);
    assert.equal(p.command, "review");
    assert.deepEqual(p.positional, []);
    assert.deepEqual(p.flags, { diff: "HEAD~1", json: true });
  });

  it("supports --flag=value and lone - shorts", () => {
    const p = parseArgs(["review", "--diff=HEAD", "-n"]);
    assert.deepEqual(p.flags, { diff: "HEAD", n: true });
  });

  it("treats lone - as a value (stdin convention)", () => {
    const p = parseArgs(["review", "--diff", "-"]);
    assert.equal(p.flags.diff, "-");
  });

  it("accumulates repeated flags", () => {
    const p = parseArgs(["review", "--exclude", "a", "--exclude", "b,c"]);
    assert.deepEqual(p.flags.exclude, ["a", "b,c"]);
  });

  it("stops flag parsing at --", () => {
    const p = parseArgs(["review", "--", "--json"]);
    assert.deepEqual(p.positional, ["--json"]);
    assert.deepEqual(p.flags, {});
  });

  it("rejects empty flag names", () => {
    assert.throws(() => parseArgs(["--=x"]), InvalidArgs);
  });
});

describe("flag readers", () => {
  it("strFlag rejects repeated single-value flags", () => {
    assert.throws(() => strFlag({ model: ["a", "b"] }, "model"), InvalidArgs);
    assert.equal(strFlag({ model: "m" }, "model"), "m");
    assert.equal(strFlag({ json: true }, "json"), undefined);
  });

  it("listFlag merges repeats and csv", () => {
    assert.deepEqual(listFlag({ exclude: ["a", "b,c"] }, "exclude"), ["a", "b", "c"]);
    assert.deepEqual(listFlag({ exclude: "x, y" }, "exclude"), ["x", "y"]);
    assert.equal(listFlag({}, "exclude"), undefined);
    assert.throws(() => listFlag({ include: true }, "include"), InvalidArgs);
  });

  it("boolFlag handles presence, values, and garbage", () => {
    assert.equal(boolFlag({}, "x"), false);
    assert.equal(boolFlag({ x: true }, "x"), true);
    assert.equal(boolFlag({ x: "false" }, "x"), false);
    assert.equal(boolFlag({ x: ["false", true] }, "x"), true);
    assert.throws(() => boolFlag({ x: "maybe" }, "x"), InvalidArgs);
  });

  it("numFlag/intFlag bound their ranges", () => {
    assert.equal(numFlag({ t: "0.7" }, "t", { min: 0, max: 1 }), 0.7);
    assert.throws(() => numFlag({ t: "2" }, "t", { min: 0, max: 1 }), InvalidArgs);
    assert.equal(intFlag({ n: "10" }, "n", { def: 1 }), 10);
    assert.throws(() => intFlag({ n: "0" }, "n", { def: 1 }), InvalidArgs);
    assert.equal(intFlag({}, "n", { def: 1 }), 1);
  });
});
