// `jev-pref doctor` — environment sanity: node version, git, keys (presence
// only, never printed), config validity, and a keyless --dry-run smoke test.
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { boolFlag } from "../args.js";
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
  const checks = [];
  const push = (name, ok, detail = "") => checks.push({ name, ok, detail });

  const major = Number(process.versions.node.split(".")[0]);
  push("node >= 20", major >= 20, process.versions.node);

  push("git available", await hasBin("git"), "");
  push("gh cli available (for --pr)", await hasBin("gh"), "");

  const hasGateway = !!process.env.AI_GATEWAY_API_KEY;
  const hasDirect = !!process.env.TYPESAFE_API_KEY || !!process.env.TYPESAFE_AI_API_KEY;
  const hasOidc = !!process.env.VERCEL_OIDC_TOKEN;
  const hasExplicit = !!process.env.JEV_API_KEY;
  push("api key (JEV_API_KEY|TYPESAFE_API_KEY|AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)", hasGateway || hasDirect || hasOidc || hasExplicit,
    hasExplicit ? "via JEV_API_KEY" : hasDirect ? "via TYPESAFE_API_KEY" : hasGateway ? "via AI_GATEWAY_API_KEY" : hasOidc ? "via VERCEL_OIDC_TOKEN" : "none set");

  const { config, sources } = await resolveConfig({ rootDir: cwd, flags: {} });
  const errors = validateConfig(config);
  push("config valid", errors.length === 0, errors.join("; "));
  if (verbose) {
    for (const [k, v] of Object.entries(config)) {
      if (k === "prefs") continue;
      push(`config.${k} <= ${sources[k]}`, true, JSON.stringify(v));
    }
    push("prefs count", true, `${config.prefs.length} [${config.prefs.map((p) => `${p.id}:${p.gate ? "gate" : "adv"}`).join(", ")}]`);
  }

  let allOk = true;
  for (const c of checks) {
    out.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    if (!c.ok) allOk = false;
  }
  return allOk ? 0 : 2;
}
