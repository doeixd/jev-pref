// Agent handoff: pipe the verdict into a user-selected command for fixing,
// escalating, or notifying. No shell is ever used — argv arrays only, verdict
// travels via stdin (JSON) or literal argv entries, so diff content with
// backticks/$() cannot inject.

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFileCb);

export class AgentError extends Error {
  constructor(message) {
    super(message);
    this.name = "AgentError";
  }
}

/**
 * @param {object} opts
 * @param {string[]} opts.command - argv array, bin first. Placeholders in any
 *   entry are replaced literally: {verdict} human text, {json} verdict JSON
 *   (without the diff — argv has OS length limits; the full payload including
 *   the diff travels via stdin), {files} csv, {outcome}.
 * @param {"json"|"text"|"none"} opts.input - stdin payload (default json,
 *   always the FULL payload including diff).
 * @param {object} opts.payload - { text, outcome, suites|hunks, diff, files }
 * @param {number} opts.timeoutMs
 * @param {{log,error}} opts.out
 * @returns {Promise<{code:number, stdout:string}>}
 */
export async function runAgent({ command, input = "json", payload, timeoutMs = 300000, out = console }) {
  if (!Array.isArray(command) || command.length === 0 || typeof command[0] !== "string") {
    throw new AgentError("agent.command must be a non-empty argv array");
  }
  const human = payload.text ?? JSON.stringify(payload.verdict ?? payload);
  // Slim copy for argv substitution: the diff can be tens of KB and argv has
  // OS length limits (E2BIG). Stdin always carries the complete payload.
  const { diff: _omitted, ...slim } = payload;
  const json = JSON.stringify(slim);
  const fullJson = JSON.stringify(payload);
  const files = (payload.files ?? []).join(",");
  const sub = (s) =>
    String(s).split("{verdict}").join(human).split("{json}").join(json)
      .split("{files}").join(files).split("{outcome}").join(payload.outcome ?? "");
  const argv = command.slice(1).map(sub);

  let stdin;
  if (input === "json") stdin = fullJson;
  else if (input === "text") stdin = `${human}\n\nfiles: ${files}`;
  else if (input === "none") stdin = undefined;
  else throw new AgentError(`agent.input must be json|text|none, got ${JSON.stringify(input)}`);

  out.log(`agent: running ${command[0]} (${argv.length} args, stdin=${input})`);
  try {
    const { stdout } = await execFileP(command[0], argv, {
      input: stdin,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    });
    if (stdout) out.log(`agent: ${String(stdout).slice(0, 2000)}`);
    return { code: 0, stdout: String(stdout ?? "") };
  } catch (cause) {
    const signal = cause?.signal ? ` (signal ${cause.signal})` : "";
    const code = cause?.code !== undefined && cause?.code !== null ? ` (exit ${cause.code})` : "";
    throw new AgentError(`${command[0]} failed${signal}${code}: ${cause?.message ?? String(cause)}`);
  }
}
