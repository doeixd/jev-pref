import assert from "node:assert/strict";
import { it } from "node:test";
import { evaluate, JEV_INPUT_TOKEN_LIMIT, SAFE_SERIALIZED_INPUT_CHARS } from "../src/jev.js";

it("rejects oversized Jev input before making a request", async () => {
  const state = { diff: "x".repeat(SAFE_SERIALIZED_INPUT_CHARS + 1) };
  await assert.rejects(
    evaluate({ state, questions: {}, timeoutMs: 100 }),
    new RegExp(`${JEV_INPUT_TOKEN_LIMIT} input tokens`),
  );
});
