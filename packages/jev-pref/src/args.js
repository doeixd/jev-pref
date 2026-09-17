// Argument parsing shared by the CLI. Supports `--flag value`, `--flag=value`,
// boolean `--flag`, and exact single-char shorts (`-n` → flags.n).
// Typo safety comes from per-command known-flag validation in cli.js — unknown
// `--flags` are rejected (exit 2), never silently ignored into wrong behavior.

export class InvalidArgs extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidArgs";
  }
}

/**
 * Parse argv into { command, positional, flags }.
 * flags maps kebab-case names to string | true. `--flag=false` (or false/0)
 * is readable via boolFlag; single-dash multi-char tokens stay positional.
 * A repeated --flag accumulates into an array (for repeatable list flags);
 * single-value readers reject arrays as usage errors.
 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  const add = (key, value) => {
    if (!key) throw new InvalidArgs(`bad flag ${JSON.stringify(key)}`);
    if (flags[key] === undefined) flags[key] = value;
    else if (Array.isArray(flags[key])) flags[key].push(value);
    else flags[key] = [flags[key], value];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        const key = a.slice(2, eq);
        add(key, a.slice(eq + 1));
      } else {
        const key = a.slice(2);
        if (!key) throw new InvalidArgs(`bad flag ${JSON.stringify(a)}`);
        const next = argv[i + 1];
        // A lone "-" is a value (stdin convention), never a flag.
        if (next !== undefined && (!next.startsWith("-") || next === "-")) {
          add(key, next);
          i++;
        } else {
          add(key, true);
        }
      }
    } else if (/^-[A-Za-z]$/.test(a)) {
      const key = a[1];
      if (flags[key] === undefined) flags[key] = true;
      else if (Array.isArray(flags[key])) flags[key].push(true);
      else flags[key] = [flags[key], true];
    } else if (a.startsWith("-") && a.length > 1) {
      positional.push(a);
    } else {
      positional.push(a);
    }
  }
  const [command, ...rest] = positional;
  return { command, positional: rest, flags };
}

/** Read a flag as string|undefined (presence-true counts as undefined). */
export function strFlag(flags, name) {
  const v = flags[name];
  if (v === undefined || v === true) return undefined;
  if (Array.isArray(v)) {
    throw new InvalidArgs(`--${name} must not repeat (got ${v.length} values)`);
  }
  return v;
}

/** Read a repeatable csv flag as string[]|undefined (repeat + comma both ok). */
export function listFlag(flags, name) {
  const v = flags[name];
  if (v === undefined) return undefined;
  const parts = (Array.isArray(v) ? v : [v]).flatMap((one) => {
    if (one === true) throw new InvalidArgs(`--${name} needs a value`);
    return String(one).split(",");
  }).map((s) => s.trim()).filter(Boolean);
  return parts;
}

/** True for bare presence and truthy values; false for false/0/no and unset. */
export function boolFlag(flags, name, { presence = true } = {}) {
  const one = (v) => {
    if (v === undefined) return false;
    if (v === true) return presence;
    const s = String(v).toLowerCase();
    if (["1", "true", "yes"].includes(s)) return true;
    if (["0", "false", "no"].includes(s)) return false;
    throw new InvalidArgs(`--${name} must be true/false, got ${JSON.stringify(v)}`);
  };
  const v = flags[name];
  if (Array.isArray(v)) return v.map(one).some(Boolean);
  return one(v);
}

/** Parse a float flag within [min, max]; throws InvalidArgs otherwise. */
export function numFlag(flags, name, { min = 0, max = 1, def }) {
  const raw = strFlag(flags, name);
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new InvalidArgs(`--${name} must be within [${min}, ${max}], got ${JSON.stringify(raw)}`);
  }
  return n;
}

/** Parse a positive-int flag; throws InvalidArgs otherwise. */
export function intFlag(flags, name, { def }) {
  const raw = strFlag(flags, name);
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new InvalidArgs(`--${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}
