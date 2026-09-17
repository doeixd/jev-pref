// Validates skills/*/SKILL.md frontmatter (name + description) and layout.
// Usage: node scripts/validate-skills.mjs
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const errors = [];
const warnings = [];

function listSkillDirs(dir, depth = 0) {
  if (!existsSync(dir) || depth > 3) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, "SKILL.md"))) out.push(full);
    out.push(...listSkillDirs(full, depth + 1));
  }
  return out;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return data;
}

const dirs = listSkillDirs(SKILLS_DIR);
if (dirs.length === 0) warnings.push("No skills found in skills/");

for (const dir of dirs) {
  const rel = dir.replace(/\\/g, "/").split("/skills/")[1];
  const skillMd = join(dir, "SKILL.md");
  const text = readFileSync(skillMd, "utf8");
  const fm = parseFrontmatter(text);
  const folderName = rel.split("/").pop();

  if (!fm) {
    errors.push(`${rel}: missing YAML frontmatter (--- block)`);
    continue;
  }
  if (!fm.name) errors.push(`${rel}: frontmatter missing 'name'`);
  if (!fm.description) errors.push(`${rel}: frontmatter missing 'description'`);
  if (fm.name && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name))
    errors.push(`${rel}: name '${fm.name}' must be lowercase with hyphens`);
  if (fm.name && fm.name !== folderName)
    warnings.push(`${rel}: directory '${folderName}' != name '${fm.name}'`);
  if (fm.description && fm.description.length < 20)
    warnings.push(`${rel}: description is very short`);
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  if (body.split(/\r?\n/).length > 500)
    warnings.push(`${rel}: SKILL.md body exceeds ~500 lines`);
}

for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\n${errors.length} error(s), ${warnings.length} warning(s), ${dirs.length} skill(s) checked.`);
  process.exit(1);
}
console.log(`OK: ${dirs.length} skill(s) valid, ${warnings.length} warning(s).`);
