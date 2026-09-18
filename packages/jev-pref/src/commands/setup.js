// `jev-pref setup` is a read-only bootstrap protocol for coding agents.
// It inspects a few high-signal repository files, then tells the agent how to
// interview the user and configure the project. The agent owns all writes.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function repositoryRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status === 0 && result.stdout.trim()) {
    return { root: resolve(result.stdout.trim()), git: true };
  }
  return { root: resolve(cwd), git: false };
}

const AUTH_ENV = ["JEV_API_KEY", "TYPESAFE_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"];

function gitCheck(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

function inspectConfig(path) {
  if (!isFile(path)) return { exists: false };
  try {
    const config = JSON.parse(readFileSync(path, "utf8"));
    return {
      exists: true,
      valid: true,
      prefCount: Array.isArray(config.prefs) ? config.prefs.length : 0,
      suites: Array.isArray(config.suites) ? config.suites : [],
    };
  } catch {
    return { exists: true, valid: false };
  }
}

export function inspectRepository(cwd = ".") {
  const { root, git } = repositoryRoot(cwd);
  const namedFiles = ["CLAUDE.md", "AGENTS.md", "AGENT.md", "CONTRIBUTING.md"];
  const sources = namedFiles.filter((name) => isFile(join(root, name)));
  const config = inspectConfig(join(root, "jev-pref.json"));
  const localConfig = inspectConfig(join(root, "jev-pref.local.json"));
  const localIgnored = git && gitCheck(root, ["check-ignore", "-q", "--", "jev-pref.local.json"]);
  const localTracked = git && gitCheck(root, ["ls-files", "--error-unmatch", "--", "jev-pref.local.json"]);
  const auth = AUTH_ENV.map((name) => ({ name, available: !!process.env[name] }));
  const workflowsDir = join(root, ".github", "workflows");
  const workflows = isDirectory(workflowsDir)
    ? readdirSync(workflowsDir).filter((name) => /\.ya?ml$/i.test(name)).sort()
    : [];
  const projectRoots = [root];
  for (const container of ["packages", "apps"]) {
    const containerPath = join(root, container);
    if (!isDirectory(containerPath)) continue;
    for (const name of readdirSync(containerPath)) {
      const child = join(containerPath, name);
      if (isDirectory(child)) projectRoots.push(child);
    }
  }
  const hasProjectFile = (name) => projectRoots.some((dir) => isFile(join(dir, name)));
  const project = [
    hasProjectFile("package.json") ? "Node.js" : null,
    hasProjectFile("tsconfig.json") ? "TypeScript" : null,
    hasProjectFile("pyproject.toml") || hasProjectFile("requirements.txt") ? "Python" : null,
    hasProjectFile("Cargo.toml") ? "Rust" : null,
  ].filter(Boolean);
  return { root, git, sources, config, localConfig, localIgnored, localTracked, auth, workflows, project };
}

function mark(found, text) {
  return `${found ? "✓" : "✗"} ${text}`;
}

export function renderSetup(info) {
  const localConfig = info.localConfig ?? { exists: false };
  const auth = info.auth ?? AUTH_ENV.map((name) => ({ name, available: false }));
  const configStatus = !info.config.exists
    ? "jev-pref.json not found"
    : info.config.valid
      ? `jev-pref.json found (${info.config.prefCount} preferences; suites: ${info.config.suites.join(", ") || "default"})`
      : "jev-pref.json found but is not valid JSON";
  const localStatus = !localConfig.exists
    ? "jev-pref.local.json not found"
    : localConfig.valid
      ? `jev-pref.local.json found (${localConfig.prefCount} personal preferences)`
      : "jev-pref.local.json found but is not valid JSON";
  const sourceLines = ["CLAUDE.md", "AGENTS.md", "AGENT.md", "CONTRIBUTING.md"]
    .map((name) => mark(info.sources.includes(name), `${name} ${info.sources.includes(name) ? "found" : "not found"}`));
  const workflowStatus = info.workflows.length > 0
    ? `${info.workflows.length} GitHub Actions workflow${info.workflows.length === 1 ? "" : "s"} found: ${info.workflows.join(", ")}`
    : "GitHub Actions workflows not found";
  const authLines = auth.map(({ name, available }) => mark(available, `${name} ${available ? "available" : "not set"}`));
  const availableAuth = auth.filter(({ available }) => available).map(({ name }) => name);

  return `jev-pref setup

You are establishing a living contract between the user, the project's human-
readable guidance, and jev-pref's executable semantic policy. This command is
read-only. You, the coding agent, will interview the user and make the requested
repository changes.

THE LIVING CONTRACT

  PROJECT GUIDANCE       What do we believe?
  CLAUDE.md / AGENTS.md / conventions and architecture docs
             |
             | translate only useful semantic rules
             v
  JEV POLICY             What can an independent evaluator judge from a diff?
  jev-pref.json + optional jev-pref.local.json
             |
             v
  REVIEW BEHAVIOR        When is it checked, and what happens next?
  Agent instructions / hooks / CI / scripts

Do not treat these as three copies of the same information. Human guidance can
be broad or procedural. A Jev check needs an externally defined answer grounded
in evidence available in the review input. Review wiring describes execution
rather than policy.

CORE PRINCIPLE

The user or project defines what counts. Jev classifies the visible evidence.
jev-pref applies thresholds and maps the result to an outcome. Never ask Jev to
invent its own standard of good, clean, simple, idiomatic, safe, adequate, or
well-designed code.

If you cannot explain what visible evidence would make an answer objectively
true, the preference is not Jev-shaped yet.

Synchronization is bidirectional. When project guidance changes, check whether
Jev policy should change. When Jev policy changes, check whether the human-
readable guidance should change. Use \`npx jev-pref sync\` for that reconciliation.

RUNTIME CONTRACT

\`npx jev-pref review\` collects a git diff and asks Jev to evaluate configured
conditions or fixed classifications. It applies thresholds and
outcome maps deterministically. Jev has a 30k-token input limit, including
state and questions. Prefer reviewing small changes. Use --hunks for file:line
scopes, --files for one bounded scope per file, and --include/--exclude to narrow
large changes. Use --json when another program consumes the result. jev-pref
never treats a truncated partial diff as approval.

  exit 0   approved, or advisory-only when failOn is "gates"
  exit 1   the configured failure policy was triggered
  exit 2   configuration, usage, or infrastructure failed; never approval

REPOSITORY INSPECTION

Root: ${info.root}
${mark(info.git, info.git ? "Git repository detected" : "Git repository not detected")}
${sourceLines.join("\n")}
${mark(info.config.exists && info.config.valid, configStatus)}
${mark(localConfig.exists && localConfig.valid, localStatus)}
${localConfig.exists ? mark(info.localIgnored && !info.localTracked, info.localTracked ? "jev-pref.local.json is tracked; personal policy should normally be untracked" : info.localIgnored ? "jev-pref.local.json is ignored by Git" : "jev-pref.local.json is not ignored by Git") : mark(info.localIgnored, info.localIgnored ? "jev-pref.local.json is covered by Git ignore rules" : "jev-pref.local.json is not covered by Git ignore rules")}
${mark(info.workflows.length > 0, workflowStatus)}
${info.project.length > 0 ? `Project signals: ${info.project.join(", ")}` : "Project signals: none detected"}

AUTHENTICATION INSPECTION (presence only; values were not read or printed)

${authLines.join("\n")}

YOUR TASK

1. Inspect the instruction and convention files, existing project/local Jev
   configs, ignore rules, and CI. Preserve useful existing setup.
2. Explain the living contract briefly to the user.
3. Classify candidate instructions before proposing Jev preferences.
4. Ask the setup questions below, skipping anything context already answers.
5. Write shared policy to jev-pref.json, personal policy to
   jev-pref.local.json, or both, based on the user's ownership choice.
6. If a local config is used, ensure jev-pref.local.json is ignored by Git.
7. Add the persistent review AND synchronization contract to the agent file(s)
   the user chooses. Run \`npx jev-pref examples agent-loop\` for the template.
8. Add hooks, CI, or scripts only if requested.
9. Run \`npx jev-pref review --dry-run\`, then show exactly what was configured.

ASK THE USER

A. OWNERSHIP — Who are these preferences for?
   - Project/team: commit jev-pref.json.
   - Personal: use gitignored jev-pref.local.json.
   - Both: commit shared policy and layer personal additions/overrides locally.
B. POLICY AND SHAPING — Which existing instructions especially need independent
   semantic review? For each candidate, identify the evidence that determines
   the answer. Ask the user to define ambiguous terms before encoding them.
C. ENFORCEMENT — For conditions, which true answers must block and which should
   be advisory? For choices, what outcome should each label produce? Default
   uncertain enforcement to advisory.
D. EXECUTION — When should review run? Recommend after a substantial bout of
   coding work, before the diff becomes large. Recommend --hunks for agent loops
   and --files for pull requests. Other choices: manual, pre-commit, or CI.
E. PERSISTENCE — Which agent instruction file(s) should receive the review and
   synchronization contract? Detected candidates: ${info.sources.join(", ") || "none"}.
F. REMEDIATION — Should the coding agent fix blocking findings and rerun?
   Recommend yes, with at most 3 review/fix iterations before asking the user.
G. CREDENTIALS — ${availableAuth.length > 0 ? `Available authentication: ${availableAuth.join(", ")}. Offer to rely on the user's chosen existing variable.` : "No supported credential is currently available. Ask which environment-variable path the user will configure."}
   Never ask the user to paste a secret into chat or write its value to a file.

Ask only when relevant about the built-in secrets suite, per-hunk file:line
findings, GitHub Actions, pre-commit, or custom JSON/exit-code scripting.

AUTHORING JEV POLICY

First classify each candidate:

  DIRECT          The answer is externally defined, visible in the supplied
                  change, and expressible as a concrete condition or fixed
                  taxonomy. Encode it.
  NEEDS SHAPING   The intent is useful, but terms such as simple, clean,
                  appropriate, idiomatic, sufficient, or too much lack written
                  criteria. Ask the user what specifically counts.
  NOT FOR JEV     The rule is procedural, needs unavailable evidence, asks for
                  subjective quality judgment, or deterministic tooling can
                  decide it better. Keep it in guidance or enforce elsewhere.

Only write DIRECT candidates to Jev config. Do not encode NEEDS SHAPING or NOT
FOR JEV candidates as vague placeholders.

Fewer externally grounded checks are better than translating every preference.
Use formatters, compilers, tests, linters, scanners, or deterministic CI when
they can decide the rule reliably.

Shape broad guidance into project-defined truth conditions:

  Human:  "Keep things simple."
  Reject: Jev would have to invent what simple means. Ask which concrete
          patterns count as unwanted complexity.

  Human:  "No new singleton state."
  Direct: "Does this change introduce new mutable module-level or global
           singleton state?"

  Human:  "Don't swallow errors."
  Direct: "Does this change catch an error and continue without returning,
           logging, transforming, or explicitly ignoring it?"

  Human:  "Don't break APIs."
  Direct: "Does this change remove or rename an exported symbol without
           retaining a deprecated alias?"

  Human:  "Tests should be sufficient."
  Reject: Define which changed behavior requires which observable test before
          creating a check.

Rules for every preference:

- The correct answer comes from a written user/project definition.
- The evidence needed to answer is present in the supplied review state.
- Two reviewers applying the definition should usually agree.
- Use one concrete yes/no condition, or a fixed user-defined taxonomy.
- Define inclusions and exclusions in guidance when the boundary needs them.
- Split questions whose parts could disagree.
- Never use a broad request to find problems or judge overall quality.

FIXED CLASSIFICATIONS

Prefer a choice when policy depends on which defined category applies. For
example, classify public API impact as none, additive, behavioral, or breaking.
The config maps each label to approve, advisory, or fix_now. Jev selects a label
and reports probabilities/confidence; jev-pref owns the consequence. Do not ask
Jev whether the API change is "bad."

POLICY OUTCOMES

Use a gate when the code should not land in that state, later repair would be
significantly harder, the rule is an actual invariant/boundary, or the user
consistently wants work to stop. Use an advisory when the externally defined
condition is worth surfacing but should not stop work. When unsure about policy
severity, start advisory and calibrate from labeled examples.

INTEGRATION MODES

  Agent loop   Recommended. Run after a meaningful bout of work, fix blocking
               findings, and review again (maximum 3 iterations). Use --hunks.
  Git/CI       Run --staged --files in a hook or use file-mode GitHub review.
  Programmatic Run review --json as a subprocess and branch on JSON + exit code.

CONFIGURATION AND OWNERSHIP

Precedence is defaults < project < local < environment < CLI. Local preferences
merge by id: same-id entries override shared rules and new ids append. Other
local fields override project fields. A minimal shared config is:

  {
    "$schema": "https://raw.githubusercontent.com/doeixd/jev-pref/master/packages/jev-pref/schema.json",
    "suites": ["prefs", "secrets"],
    "gateThreshold": 0.7,
    "advisoryThreshold": 0.7,
    "failOn": "gates",
    "prefs": [
      {
        "id": "no_swallowed_errors",
        "gate": false,
        "question": "Does this change catch an error and continue without returning, logging, transforming, or explicitly ignoring it?",
        "guidance": "Count only catch/error branches added or changed in this review."
      },
      {
        "id": "public_api_change",
        "type": "choice",
        "question": "Classify the public API impact introduced by this change.",
        "labels": {
          "none": "No exported API changes.",
          "additive": "Only backwards-compatible additions.",
          "behavioral": "Existing API remains callable but observable behavior changes.",
          "breaking": "An existing export is removed, renamed, or requires incompatible usage."
        },
        "outcomes": {
          "none": "approve",
          "additive": "approve",
          "behavioral": "advisory",
          "breaking": "fix_now"
        }
      }
    ]
  }

Use snake_case preference and label ids. Condition checks use gate:true only
when a sufficiently probable true answer should block. Choice checks map every
label to an outcome. Classification probability controls whether the configured
outcome applies; policy severity still comes from gate or outcomes. For personal
additions, use the same shape in jev-pref.local.json and add that path to
.gitignore. Never place personal policy in the shared file without agreement.

CREDENTIALS

Authentication precedence is JEV_API_KEY, TYPESAFE_API_KEY,
AI_GATEWAY_API_KEY, then VERCEL_OIDC_TOKEN. Persist only the selected variable
name in guidance. Never write credential values to config, instructions,
scripts, committed environment files, or chat.

PERSISTENT CONTRACT

The chosen agent file must say when to review, how to handle approve/advisory/
fix/error outcomes, and when to stop retrying. It must also require bidirectional
synchronization: meaningful policy-doc changes trigger \`npx jev-pref sync\`, and
Jev preference changes trigger a check of the corresponding human guidance. It
must re-check Jev fitness: subjective checks need concrete observable criteria
or removal. Ambiguous semantic policy changes require user input.

RECIPES

Run one of these to print a copyable recipe:

  npx jev-pref examples agent-loop
  npx jev-pref examples pre-commit
  npx jev-pref examples github-action
  npx jev-pref examples review-script

After real verdicts accumulate, use npx jev-pref tune --sweep to calibrate
thresholds against labeled examples.`;
}

export async function setup(argv, { cwd = ".", out = console } = {}) {
  if (argv.positional.length > 0) {
    out.error(`review-error: setup takes no arguments (got ${argv.positional.join(" ")})`);
    return 2;
  }
  out.log(renderSetup(inspectRepository(cwd)));
  return 0;
}
