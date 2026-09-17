// Argument parsing shared by the CLI and (later) the GitHub Action input mapper.
// Supports `--flag value`, `--flag=value`, boolean `--flag`, and `-abc` shorts
// only where explicitly registered. Unknown `--x=y` never silently falls back:
// unknown flags throw InvalidArgs (exit 2), never a wrong-scope review.

export class InvalidArgs extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidArgs";
  }
}

/**
 * Parse argv into { command, positional, flags }.
 * flags maps kebab-case names to string | true. `--no-x` is not supported;
 * use explicit `--x false`? No — booleans are presence flags (see commands).
 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
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
        if (!key) throw new InvalidArgs(`bad flag ${JSON.stringify(a)}`);
        flags[key] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        if (!key) throw new InvalidArgs(`bad flag ${JSON.stringify(a)}`);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (a.startsWith("-") && a.length > 1) {
      // Single-dash clusters are NOT expanded (avoids `-n` vs `-n value`
      // ambiguity); only exact registered shorts are handled by commands.
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
  return typeof v === "string" ? v : undefined;
}

/** True only with explicit truthy values or bare presence where allowed. */
export function boolFlag(flags, name, { presence = true } = {}) {
  const v = flags[name];
  if (v === undefined) return false;
  if (v === true) return presence;
  return ["1", "true", "yes"].includes(String(v).toLowerCase());
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
