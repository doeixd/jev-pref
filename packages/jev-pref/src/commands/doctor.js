// `jev-pref doctor` — environment sanity: node version, git, keys (presence
// only, never printed), config validity. gh is advisory-only (needed just
// for `review --pr`); a missing key fails because live review needs one
// (use --dry-run flows keyless).
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { boolFlag, strFlag } from "../args.js";
import { resolveConfig, validateConfig } from "../config.js";

const execFile = promisify(execFileCb);

async function hasBin(bin, args = ["--version"]) {
  try {
    await execFile(bin, args, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

export async function doctor(argv, { cwd = ".", out = console } = {}) {
  const verbose = boolFlag(argv.flags, "verbose") || boolFlag(argv.flags, "v");
  const checks = []; // { name, ok, detail, advisory }
  const push = (name, ok, detail = "", advisory = false) => checks.push({ name, ok, detail, advisory });

  const major = Number(process.versions.node.split(".")[0]);
  push("node >= 20", major >= 20, process.versions.node);

  push("git available", await hasBin("git"), "");
  push("gh cli (for --pr only)", await hasBin("gh"), "", true);

  // Exactly the cascade the engine uses: JEV_API_KEY passed explicitly,
  // else advocaat's TYPESAFE_API_KEY → AI_GATEWAY_API_KEY → VERCEL_OIDC_TOKEN.
  const hasGateway = !!process.env.AI_GATEWAY_API_KEY;
  const hasDirect = !!process.env.TYPESAFE_API_KEY;
  const hasOidc = !!process.env.VERCEL_OIDC_TOKEN;
  const hasExplicit = !!process.env.JEV_API_KEY;
  push("api key (JEV_API_KEY|TYPESAFE_API_KEY|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)", hasGateway || hasDirect || hasOidc || hasExplicit,
    hasExplicit ? "via JEV_API_KEY" : hasDirect ? "via TYPESAFE_API_KEY" : hasGateway ? "via AI_GATEWAY_API_KEY" : hasOidc ? "via VERCEL_OIDC_TOKEN" : "none set — live review/tune need one");

  let config;
  let configFlag;
  try {
    configFlag = strFlag(argv.flags, "config");
    ({ config } = await resolveConfig({
      rootDir: cwd,
      flags: configFlag !== undefined ? { config: configFlag } : {},
    }));
  } catch (e) {
    push("config load", false, e?.message ?? String(e));
    config = null;
  }
  if (config) {
    const errors = validateConfig(config);
    push("config valid", errors.length === 0, errors.join("; "));
    if (verbose) {
      // Re-resolve for sources (cheap, local IO only).
      const { sources, ignored, fencedFile } = await resolveConfig({
        rootDir: cwd,
        flags: configFlag !== undefined ? { config: configFlag } : {},
      });
      for (const [k, v] of Object.entries(config)) {
        if (k === "prefs") continue;
        push(`config.${k} <= ${sources[k] ?? "?"}`, true, JSON.stringify(v));
      }
      push("prefs count", true, `${config.prefs.length} [${config.prefs.map((p) => `${p.id}:${p.gate ? "gate" : "adv"}`).join(", ")}]`);
      if (fencedFile) push("fenced block", true, `from ${fencedFile}`);
      for (const [layer, keys] of Object.entries(ignored)) {
        if (keys.length > 0) push(`ignored unknown ${layer} keys`, true, `${keys.join(", ")} (typo?)`, true);
      }
    }
  }

  let allOk = true;
  for (const c of checks) {
    const mark = c.ok ? "ok  " : c.advisory ? "warn" : "FAIL";
    out.log(`${mark} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    if (!c.ok && !c.advisory) allOk = false;
  }
  return allOk ? 0 : 2;
}
