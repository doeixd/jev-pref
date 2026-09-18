// Jev client over advocaat's ask(): one call, all suites' questions batched.
// Keeps our own retry (advocaat does none) + timeout signal + error mapping
// to the 0/1/2 contract. Answer fields: noul→chance, score→score, choice→choice.
import { APIError, ask } from "advocaat";
import { JEV_INPUT_TOKEN_LIMIT, SAFE_SERIALIZED_INPUT_CHARS, serializedInputChars } from "./budget.js";

export { JEV_INPUT_TOKEN_LIMIT, SAFE_SERIALIZED_INPUT_CHARS } from "./budget.js";

export class JevError extends Error {
  constructor(message, { status = 0, body = "" } = {}) {
    super(message);
    this.name = "JevError";
    this.status = status;
    this.body = body;
  }
}

export class JevOverloadedError extends JevError {
  constructor(message) {
    super(message);
    this.name = "JevOverloadedError";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function backoffMs(attempt) {
  return Math.min(500 * 2 ** attempt, 30000);
}

/**
 * @param {object} opts
 * @param {unknown} opts.state
 * @param {Record<string, unknown>} opts.questions
 * @param {object} opts.client - { apiKey?, baseURL?, model?, provider?, zeroDataRetention? }
 * @param {number} opts.timeoutMs
 * @param {number} opts.maxRetries (overload retries only; default 5)
 */
export async function evaluate({ state, questions, client = {}, timeoutMs = 60000, maxRetries = 5 }) {
  const serializedChars = serializedInputChars(state, questions);
  if (serializedChars > SAFE_SERIALIZED_INPUT_CHARS) {
    throw new JevError(
      `planned input is ${serializedChars} characters before tokenization; ` +
      `Jev accepts at most ${JEV_INPUT_TOKEN_LIMIT} input tokens. Review a smaller scope.`,
    );
  }
  const options = {};
  if (client.apiKey) options.apiKey = client.apiKey;
  if (client.baseURL) options.baseURL = client.baseURL;
  if (client.model) options.model = client.model;
  if (client.provider) options.provider = client.provider;
  if (client.zeroDataRetention) options.vercel = { zeroDataRetention: true };
  options.signal = AbortSignal.timeout(timeoutMs);

  let attempt = 0;
  for (;;) {
    try {
      const answers = await ask(state, questions, options);
      // AbortSignal was consumed; recreate per attempt is unnecessary —
      // a fresh signal per retry avoids an already-aborted signal.
      return answers;
    } catch (cause) {
      if (cause instanceof APIError && (cause.status === 429 || cause.status === 529)) {
        if (attempt >= maxRetries) {
          throw new JevOverloadedError(`jev overloaded (HTTP ${cause.status}) after ${attempt + 1} attempts`);
        }
        // Re-arm the timeout for the next attempt.
        options.signal = AbortSignal.timeout(timeoutMs);
        await sleep(backoffMs(attempt));
        attempt++;
        continue;
      }
      if (cause instanceof APIError) {
        const body = typeof cause.body === "string" ? cause.body : JSON.stringify(cause.body ?? "");
        throw new JevError(`jev rejected the request (HTTP ${cause.status}): ${body.slice(0, 500)}`, {
          status: cause.status,
          body,
        });
      }
      throw new JevError(`jev request failed: ${cause?.message ?? String(cause)}`);
    }
  }
}
