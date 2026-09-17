// Config resolution. Precedence (highest wins):
//   CLI flags > JEV_* env vars > jev-pref.json > fenced ```jev-prefs block
//   in CLAUDE.md / AGENTS.md > built-in defaults.
// API keys NEVER come from files: JEV_API_KEY (explicit) else advocaat's own
// cascade (TYPESAFE_API_KEY → AI_GATEWAY_API_KEY → VERCEL_OIDC_TOKEN).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULTS = {
  suites: ["prefs"],
  gateThreshold: 0.7,
  advisoryThreshold: 0.7,
  severityFail: 1.5,
  failOn: "gates", // gates | all | never
  timeoutMs: 60000,
  maxDiffChars: 24000,
  model: undefined, // undefined = advocaat default (jev-latest / typesafe-ai/jev)
  baseUrl: undefined,
  provider: undefined, // typesafe | vercel | undefined (auto)
  zeroDataRetention: false,
  prefs: [],
};

const ENV_MAP = [
  ["JEV_SUITES", "suites", (v) => v.split(",").map((s) => s.trim()).filter(Boolean)],
  ["JEV_GATE_THRESHOLD", "gateThreshold", Number],
  ["JEV_ADVISORY_THRESHOLD", "advisoryThreshold", Number],
  ["JEV_SEVERITY_FAIL", "severityFail", Number],
  ["JEV_FAIL_ON", "failOn", String],
  ["JEV_TIMEOUT_MS", "timeoutMs", Number],
  ["JEV_MAX_DIFF_CHARS", "maxDiffChars", Number],
  ["JEV_MODEL", "model", String],
  ["JEV_BASE_URL", "baseUrl", String],
  ["JEV_PROVIDER", "provider", String],
  ["JEV_ZERO_DATA_RETENTION", "zeroDataRetention", (v) => ["1", "true", "yes"].includes(v.toLowerCase())],
  ["JEV_CONFIG", "configPath", String],
];

function readEnv() {
  const out = {};
  for (const [env, key, parse] of ENV_MAP) {
    const raw = process.env[env];
    if (raw === undefined || raw === "") continue;
    try {
      out[key] = parse(raw);
    } catch {
      // Ignore unparseable env; commands validate the merged result.
    }
  }
  return out;
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** Extract the first ```jev-prefs fenced JSON block from a markdown file. */
export function extractFencedBlock(markdown) {
  const m = markdown.match(/```jev-prefs\s*\r?\n([\s\S]*?)\r?\n```/);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]);
  } catch {
    return undefined;
  }
}

async function readFencedBlock(rootDir) {
  for (const name of ["CLAUDE.md", "AGENTS.md"]) {
    try {
      const text = await readFile(join(rootDir, name), "utf8");
      const block = extractFencedBlock(text);
      if (block) return block;
    } catch {
      // Missing/unreadable — try the next file.
    }
  }
  return undefined;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

const KNOWN_KEYS = Object.keys(DEFAULTS).concat(["configPath", "prefsPath"]);

/**
 * Merge, in increasing precedence: defaults < fenced < json < env < flags.
 * Unknown keys are dropped (typo safety). Returns { config, sources } where
 * sources notes which layer provided each key (for `doctor --verbose`).
 */
export async function resolveConfig({ rootDir = ".", flags = {} } = {}) {
  const env = readEnv();
  const configPath = flags.config ?? env.configPath ?? join(rootDir, "jev-pref.json");
  const json = (await readJsonFile(configPath)) ?? {};
  const fenced = (await readFencedBlock(rootDir)) ?? {};

  const layers = [
    { name: "defaults", values: DEFAULTS },
    { name: "fenced", values: pick(fenced, KNOWN_KEYS) },
    { name: "json", values: pick(json, KNOWN_KEYS) },
    { name: "env", values: pick(env, KNOWN_KEYS) },
    { name: "flags", values: pick(flags, KNOWN_KEYS) },
  ];
  const config = {};
  const sources = {};
  for (const { name, values } of layers) {
    for (const [k, v] of Object.entries(values)) {
      config[k] = v;
      sources[k] = name;
    }
  }
  return { config, sources, configPath };
}

/** API key resolution: explicit flag/env only, else undefined (advocaat cascades). */
export function resolveApiKey(flags = {}) {
  if (typeof flags.apiKey === "string" && flags.apiKey !== "") return flags.apiKey;
  const env = process.env.JEV_API_KEY;
  if (env) return env;
  return undefined;
}

export function validateConfig(config) {
  const errors = [];
  if (!Array.isArray(config.prefs)) errors.push("prefs must be an array");
  else {
    for (const [i, p] of config.prefs.entries()) {
      if (!p || typeof p.id !== "string" || !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(p.id)) {
        errors.push(`prefs[${i}].id must be snake_case`);
      }
      if (typeof p.gate !== "boolean") errors.push(`prefs[${i}].gate must be boolean`);
      if (typeof p.text !== "string" || p.text.length === 0) errors.push(`prefs[${i}].text must be non-empty`);
    }
  }
  for (const k of ["gateThreshold", "advisoryThreshold"]) {
    const n = config[k];
    if (typeof n !== "number" || !(n >= 0 && n <= 1)) errors.push(`${k} must be within [0, 1]`);
  }
  if (typeof config.severityFail !== "number" || !(config.severityFail >= 0)) {
    errors.push("severityFail must be a non-negative number");
  }
  if (!["gates", "all", "never"].includes(config.failOn)) errors.push("failOn must be gates|all|never");
  if (!Array.isArray(config.suites) || config.suites.some((s) => typeof s !== "string")) {
    errors.push("suites must be an array of strings");
  }
  return errors;
}
