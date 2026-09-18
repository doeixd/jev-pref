import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RECIPES = {
  "agent-loop": "agent-loop.md",
  "pre-commit": "pre-commit.sh",
  "github-action": "github-action.yml",
  "review-script": "review.mjs",
};

export async function examples(argv, { out = console } = {}) {
  const name = argv.positional[0];
  if (argv.positional.length > 1 || (name && !RECIPES[name])) {
    out.error(`review-error: unknown example ${JSON.stringify(name)} (known: ${Object.keys(RECIPES).join(", ")})`);
    return 2;
  }
  if (!name) {
    out.log(`jev-pref examples — copyable integration recipes

  agent-loop     persistent instructions for coding agents (recommended)
  pre-commit     staged-diff Git hook
  github-action  pull-request review workflow
  review-script  Node subprocess wrapper using JSON + exit codes

Print one with: jev-pref examples <name>`);
    return 0;
  }
  const examplesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples");
  out.log(await readFile(join(examplesDir, RECIPES[name]), "utf8"));
  return 0;
}
