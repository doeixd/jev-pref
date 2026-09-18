// Config resolution. Precedence (highest wins):
//   CLI flags > JEV_* env vars > jev-pref.local.json > jev-pref.json >
//   fenced ```jev-prefs block in agent files > built-in defaults.
// Local prefs merge by id: they override same-id project prefs and append new
// personal prefs. Other local settings replace the corresponding project value.
// API keys NEVER come from files: JEV_API_KEY (explicit) else advocaat's own
// cascade (TYPESAFE_API_KEY → AI_GATEWAY_API_KEY → VERCEL_OIDC_TOKEN).
import { execFile as execFileCb } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Repo root for bounded upward search; null outside git (then no traversal). */
async function gitToplevel(dir) {
  try {
    const { stdout } = await execFile("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** rootDir, then ancestors up to (and including) stop. */
function chainUp(rootDir, stop) {
  const chain = [rootDir];
  let dir = rootDir;
  while (dir !== stop && dir !== dirname(dir)) {
    dir = dirname(dir);
    chain.push(dir);
    if (chain.length > 50) break; // pathological depth guard
  }
  return chain;
}

export const DEFAULTS = {
  suites: ["prefs"],
  gateThreshold: 0.7,
  advisoryThreshold: 0.7,
  failOn: "gates", // gates | all | never
  timeoutMs: 60000,
  // Per-request diff budget. Deliberately conservative because Jev's complete
  // input (state + questions) has a 30k-token ceiling.
  maxDiffChars: 20000,
  hunks: false,
  files: false,
  maxHunks: 10,
  include: [],
  exclude: [],
  agent: null, // { command: [...argv], input: json|text|none, on: [fix_now], timeoutMs }
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
  ["JEV_FAIL_ON", "failOn", String],
  ["JEV_TIMEOUT_MS", "timeoutMs", Number],
  ["JEV_MAX_DIFF_CHARS", "maxDiffChars", Number],
  ["JEV_HUNKS", "hunks", (v) => ["1", "true", "yes"].includes(v.toLowerCase())],
  ["JEV_FILES", "files", (v) => ["1", "true", "yes"].includes(v.toLowerCase())],
  ["JEV_MAX_HUNKS", "maxHunks", Number],
  ["JEV_INCLUDE", "include", (v) => v.split(",").map((s) => s.trim()).filter(Boolean)],
  ["JEV_EXCLUDE", "exclude", (v) => v.split(",").map((s) => s.trim()).filter(Boolean)],
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
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return { found: false };
    throw new Error(`cannot read config ${path}: ${e?.message ?? String(e)}`);
  }
  try {
    return { found: true, value: JSON.parse(text) };
  } catch (e) {
    throw new Error(`invalid JSON in ${path}: ${e?.message ?? String(e)}`);
  }
}

/** Extract the first ```jev-prefs fenced JSON block from a markdown file. */
export function extractFencedBlock(markdown) {
  const m = markdown.match(/```jev-prefs\s*\r?\n([\s\S]*?)\r?\n```/);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`invalid JSON in \`\`\`jev-prefs block: ${e?.message ?? String(e)}`);
  }
}

async function readFencedBlock(rootDir, stop) {
  for (const dir of chainUp(rootDir, stop)) {
    for (const name of ["CLAUDE.md", "AGENTS.md", "AGENT.md"]) {
      let text;
      try {
        text = await readFile(join(dir, name), "utf8");
      } catch {
        continue; // Missing/unreadable — try the next file.
      }
      if (!text.includes("```jev-prefs")) continue; // No block — keep looking.
      // Present-but-broken fails loud (same philosophy as jev-pref.json):
      // a typo'd block must never silently become defaults.
      try {
        const block = extractFencedBlock(text) ?? {};
        return { block, file: join(dir, name) };
      } catch (e) {
        throw new Error(`${join(dir, name)}: ${e.message}`);
      }
    }
  }
  return { block: {}, file: null };
}

/** Nearest named config at/below stop; null when none (defaults apply). */
async function findConfigFile(rootDir, stop, name = "jev-pref.json") {
  for (const dir of chainUp(rootDir, stop)) {
    const candidate = join(dir, name);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

const KNOWN_KEYS = Object.keys(DEFAULTS);

/** Merge a local preference list over shared prefs without dropping either. */
function mergeLocalPrefs(shared, local) {
  if (local === undefined) return shared;
  if (!Array.isArray(shared) || !Array.isArray(local)) return local;
  const merged = [...shared];
  const firstIndex = new Map();
  for (let i = 0; i < merged.length; i++) {
    const id = merged[i]?.id;
    if (typeof id === "string" && !firstIndex.has(id)) firstIndex.set(id, i);
  }
  const seenLocal = new Set();
  for (const pref of local) {
    const id = pref?.id;
    // Preserve duplicate ids within one local file so validateConfig reports
    // them instead of silently choosing one.
    if (typeof id === "string" && seenLocal.has(id)) {
      merged.push(pref);
      continue;
    }
    if (typeof id === "string") seenLocal.add(id);
    if (typeof id === "string" && firstIndex.has(id)) {
      merged[firstIndex.get(id)] = pref;
    } else {
      if (typeof id === "string") firstIndex.set(id, merged.length);
      merged.push(pref);
    }
  }
  return merged;
}

/**
 * Merge, in increasing precedence:
 * defaults < fenced < project json < local json < env < flags.
 * Unknown keys are dropped (typo safety) and reported in `ignored` as
 * { layer: [keys] } — `doctor --verbose` surfaces them. `$schema` is always
 * allowed silently (editors use it; it is not a setting).
 * Returns { config, sources, ignored, configPath, localConfigPath,
 * localConfigFound }. A malformed project/local config or fenced block is a
 * hard error (exit 2), never silent defaults.
 */
export async function resolveConfig({ rootDir = ".", flags = {} } = {}) {
  const env = readEnv();
  const absRoot = resolve(rootDir);
  // Config discovery walks up to the git root (subdir-safe: running in
  // packages/app finds the repo's jev-pref.json). Outside git, root only.
  const top = (await gitToplevel(absRoot)) ?? absRoot;
  const explicit = flags.config ?? env.configPath;
  let configPath;
  let json = {};
  if (explicit !== undefined) {
    configPath = explicit;
    const loaded = await readJsonFile(configPath);
    if (!loaded.found) throw new Error(`config not found: ${configPath}`);
    if (loaded.value === null || typeof loaded.value !== "object" || Array.isArray(loaded.value)) {
      throw new Error(`invalid JSON in ${configPath}: top level must be an object`);
    }
    json = loaded.value;
  } else {
    // A missing default config is fine (fenced block / flags may supply
    // prefs); a present-but-broken one must fail loud.
    const found = await findConfigFile(absRoot, top);
    configPath = found ?? join(absRoot, "jev-pref.json");
    if (found) {
      const loaded = await readJsonFile(found);
      if (!loaded.found) throw new Error(`config not found: ${found}`);
      if (loaded.value === null || typeof loaded.value !== "object" || Array.isArray(loaded.value)) {
        throw new Error(`invalid JSON in ${found}: top level must be an object`);
      }
      json = loaded.value;
    }
  }
  // The local layer is always a companion to the selected project config. If
  // there is no project config, discover a standalone local config upward so
  // personal-only setups work too.
  let localConfigPath;
  let localConfigFound = false;
  let local = {};
  if (explicit !== undefined || configPath) {
    const companion = join(dirname(resolve(configPath)), "jev-pref.local.json");
    const loaded = await readJsonFile(companion);
    localConfigPath = companion;
    if (loaded.found) {
      localConfigFound = true;
      if (loaded.value === null || typeof loaded.value !== "object" || Array.isArray(loaded.value)) {
        throw new Error(`invalid JSON in ${companion}: top level must be an object`);
      }
      local = loaded.value;
    }
  }
  if (!localConfigFound && explicit === undefined && !(await exists(configPath))) {
    const foundLocal = await findConfigFile(absRoot, top, "jev-pref.local.json");
    if (foundLocal) {
      const loaded = await readJsonFile(foundLocal);
      configPath = join(dirname(foundLocal), "jev-pref.json");
      localConfigPath = foundLocal;
      localConfigFound = true;
      if (loaded.value === null || typeof loaded.value !== "object" || Array.isArray(loaded.value)) {
        throw new Error(`invalid JSON in ${foundLocal}: top level must be an object`);
      }
      local = loaded.value;
    }
  }
  const { block: fenced, file: fencedFile } = await readFencedBlock(absRoot, top);

  const layers = [
    { name: "defaults", values: DEFAULTS },
    { name: "fenced", values: pick(fenced, KNOWN_KEYS) },
    { name: "project", values: pick(json, KNOWN_KEYS) },
    { name: "local", values: pick(local, KNOWN_KEYS) },
    { name: "env", values: pick(env, KNOWN_KEYS) },
    { name: "flags", values: pick(flags, KNOWN_KEYS) },
  ];
  const config = {};
  const sources = {};
  for (const { name, values } of layers) {
    for (const [k, v] of Object.entries(values)) {
      const mergedLocalPrefs = name === "local" && k === "prefs";
      const hadPrefs = mergedLocalPrefs && Array.isArray(config.prefs) && config.prefs.length > 0;
      const previousSource = sources.prefs;
      config[k] = mergedLocalPrefs ? mergeLocalPrefs(config.prefs, v) : v;
      sources[k] = mergedLocalPrefs && hadPrefs ? `${previousSource}+local` : name;
    }
  }
  const ignored = {
    fenced: Object.keys(fenced).filter((k) => !KNOWN_KEYS.includes(k) && k !== "$schema"),
    json: Object.keys(json).filter((k) => !KNOWN_KEYS.includes(k) && k !== "$schema"),
    local: Object.keys(local).filter((k) => !KNOWN_KEYS.includes(k) && k !== "$schema"),
  };
  return { config, sources, ignored, configPath, localConfigPath, localConfigFound, fencedFile };
}

/** API key resolution is env-only by design (never flags, never files). */
export function resolveApiKey() {
  return process.env.JEV_API_KEY || undefined;
}

export function validateConfig(config) {
  const errors = [];
  if (!Array.isArray(config.prefs)) errors.push("prefs must be an array");
  else {
    for (const [i, p] of config.prefs.entries()) {
      if (!p || typeof p.id !== "string" || !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(p.id)) {
        errors.push(`prefs[${i}].id must be snake_case`);
      }
      const type = p?.type ?? "condition";
      if (!["condition", "choice"].includes(type)) errors.push(`prefs[${i}].type must be condition|choice`);
      if (p?.scope !== undefined && !["hunk", "change"].includes(p.scope)) {
        errors.push(`prefs[${i}].scope must be hunk|change`);
      }
      if (p?.guidance !== undefined && (typeof p.guidance !== "string" || p.guidance.length === 0)) {
        errors.push(`prefs[${i}].guidance must be a non-empty string`);
      }
      for (const k of ["name", "description"]) {
        if (p?.[k] !== undefined && (typeof p[k] !== "string" || p[k].length === 0)) {
          errors.push(`prefs[${i}].${k} must be a non-empty string`);
        }
      }
      if (type === "condition") {
        if (typeof p.gate !== "boolean") errors.push(`prefs[${i}].gate must be boolean`);
        const hasQuestion = typeof p.question === "string" && p.question.length > 0;
        const hasLegacyText = typeof p.text === "string" && p.text.length > 0;
        if (!hasQuestion && !hasLegacyText) errors.push(`prefs[${i}] needs a non-empty question (or legacy text)`);
      } else {
        if (typeof p.question !== "string" || p.question.length === 0) errors.push(`prefs[${i}].question must be non-empty`);
        if (p.gate !== undefined) errors.push(`prefs[${i}].gate is not used for choice preferences; map labels with outcomes`);
        const labels = p.labels;
        const outcomes = p.outcomes;
        if (!labels || typeof labels !== "object" || Array.isArray(labels) || Object.keys(labels).length < 2 || Object.keys(labels).length > 255) {
          errors.push(`prefs[${i}].labels must define between 2 and 255 labels`);
        } else if (Object.entries(labels).some(([label, description]) => !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(label) || typeof description !== "string" || description.length === 0)) {
          errors.push(`prefs[${i}].labels must map snake_case labels to non-empty descriptions`);
        }
        if (!outcomes || typeof outcomes !== "object" || Array.isArray(outcomes)) {
          errors.push(`prefs[${i}].outcomes must map every label to approve|advisory|fix_now`);
        } else if (Object.values(outcomes).some((outcome) => !["approve", "advisory", "fix_now"].includes(outcome))) {
          errors.push(`prefs[${i}].outcomes values must be approve|advisory|fix_now`);
        }
        if (labels && outcomes && typeof labels === "object" && typeof outcomes === "object" && !Array.isArray(labels) && !Array.isArray(outcomes)) {
          const labelKeys = Object.keys(labels).sort();
          const outcomeKeys = Object.keys(outcomes).sort();
          if (JSON.stringify(labelKeys) !== JSON.stringify(outcomeKeys)) errors.push(`prefs[${i}].outcomes keys must exactly match labels`);
        }
      }
    }
  }
  for (const k of ["gateThreshold", "advisoryThreshold"]) {
    const n = config[k];
    if (typeof n !== "number" || !(n >= 0 && n <= 1)) errors.push(`${k} must be within [0, 1]`);
  }
  if (!["gates", "all", "never"].includes(config.failOn)) errors.push("failOn must be gates|all|never");
  if (!Array.isArray(config.suites) || config.suites.some((s) => typeof s !== "string")) {
    errors.push("suites must be an array of strings");
  } else if (config.suites.length === 0) {
    errors.push("suites must not be empty");
  }
  for (const k of ["timeoutMs", "maxDiffChars", "maxHunks"]) {
    const n = config[k];
    if (!Number.isInteger(n) || n <= 0) errors.push(`${k} must be a positive integer`);
  }
  if (typeof config.hunks !== "boolean") errors.push("hunks must be boolean");
  if (typeof config.files !== "boolean") errors.push("files must be boolean");
  if (config.hunks && config.files) errors.push("hunks and files must not both be true");
  for (const k of ["include", "exclude"]) {
    if (!Array.isArray(config[k]) || config[k].some((g) => typeof g !== "string")) {
      errors.push(`${k} must be an array of glob strings`);
    }
  }
  if (config.model !== undefined && typeof config.model !== "string") errors.push("model must be a string");
  if (config.baseUrl !== undefined && typeof config.baseUrl !== "string") errors.push("baseUrl must be a string");
  if (config.provider !== undefined && !["typesafe", "vercel"].includes(config.provider)) {
    errors.push("provider must be typesafe|vercel");
  }
  if (typeof config.zeroDataRetention !== "boolean") errors.push("zeroDataRetention must be boolean");
  if (config.agent !== null && config.agent !== undefined) {
    const a = config.agent;
    if (!Array.isArray(a.command) || a.command.length === 0 || a.command.some((c) => typeof c !== "string")) {
      errors.push("agent.command must be a non-empty argv array");
    }
    if (a.input !== undefined && !["json", "text", "none"].includes(a.input)) {
      errors.push("agent.input must be json|text|none");
    }
    if (a.on !== undefined) {
      if (!Array.isArray(a.on) || a.on.length === 0 || a.on.some((o) => !["fix_now", "advisory", "approve"].includes(o))) {
        errors.push("agent.on must be a non-empty array of fix_now|advisory|approve");
      }
    }
    if (a.timeoutMs !== undefined && (!Number.isInteger(a.timeoutMs) || a.timeoutMs <= 0)) {
      errors.push("agent.timeoutMs must be a positive integer");
    }
  }
  const seen = new Set();
  for (const p of Array.isArray(config.prefs) ? config.prefs : []) {
    if (typeof p?.id === "string") {
      if (seen.has(p.id)) errors.push(`duplicate pref id ${JSON.stringify(p.id)}`);
      seen.add(p.id);
    }
  }
  return errors;
}
