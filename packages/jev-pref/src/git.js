// Git state collection. Port of the hardened template logic:
// argv-style execFile (no shell — --diff is allowlisted anyway), repo-root
// anchoring (subdir-safe), untracked inclusion with binary skip, truncation.
import { execFile as execFileCb } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export class GitError extends Error {
  constructor(args, message) {
    super(message);
    this.name = "GitError";
    this.args = args;
  }
}

export class UnsafeRefError extends Error {
  constructor(ref) {
    super(`unsafe --diff ref ${JSON.stringify(ref)}`);
    this.name = "UnsafeRefError";
    this.ref = ref;
  }
}

export const SAFE_REF = /^[A-Za-z0-9_.\-/~:^{}]+$/;

export function assertSafeRef(ref) {
  if (!SAFE_REF.test(ref) || ref.startsWith("-")) throw new UnsafeRefError(ref);
}

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".avif",
  ".zip", ".gz", ".tgz", ".tar", ".7z", ".pdf", ".woff", ".woff2",
  ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".mov", ".wav", ".exe",
  ".dll", ".so", ".dylib", ".bin", ".dat", ".lock",
]);

async function runGit(args, cwd, { quiet = false } = {}) {
  try {
    const { stdout } = await execFile("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });
    return stdout;
  } catch (cause) {
    if (quiet) throw { quiet: true, cause };
    const stderr = cause?.stderr ?? cause?.message ?? String(cause);
    throw new GitError(args.join(" "), `git ${args.join(" ")} failed: ${String(stderr).split("\n")[0]}`);
  }
}

async function hasHead(root) {
  try {
    await runGit(["rev-parse", "--verify", "HEAD"], root, { quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function untrackedContent(root, list, budget) {
  const out = [];
  const sections = [];
  let used = 0;
  for (const f of list.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20)) {
    if (BINARY_EXT.has(extname(f).toLowerCase())) {
      out.push(`--- new file: ${f} (binary, skipped) ---`);
      continue;
    }
    try {
      const abs = join(root, f);
      const info = await stat(abs);
      if (info.size > 20000) {
        out.push(`--- new file: ${f} (too large, skipped) ---`);
        continue;
      }
      const content = await readFile(abs, "utf8");
      if (content.includes("\0")) {
        out.push(`--- new file: ${f} (binary, skipped) ---`);
        continue;
      }
      if (used + content.length > budget) {
        out.push(`--- new file: ${f} (budget exceeded, skipped) ---`);
        continue;
      }
      used += content.length;
      const section = `--- new file: ${f} ---\n${content}`;
      out.push(section);
      sections.push({ file: f, text: section });
    } catch {
      out.push(`--- new file: ${f} (unreadable, skipped) ---`);
    }
  }
  return { text: out.join("\n"), sections };
}

/**
 * Collect review state.
 * @param {object} opts - { ref?: string|null, staged?: boolean, maxDiffChars,
 *   include?: string[], exclude?: string[] }
 * ref = explicit git ref/range (allowlisted); staged = --cached only.
 * Untracked files are included ONLY for working-tree scope — a --staged,
 * --diff, or --pr review judges exactly what that scope contains.
 */
export async function collectState({ cwd = ".", ref = null, staged = false, maxDiffChars = 24000, include = [], exclude = [] } = {}) {
  if (ref != null) assertSafeRef(ref);
  // Anchor at the repo root: pathspecs and untracked listings are cwd-scoped.
  // review always needs a repo — fail fast with a clear message otherwise.
  let root;
  try {
    root = (await runGit(["rev-parse", "--show-toplevel"], cwd)).trim();
  } catch {
    throw new GitError("rev-parse --show-toplevel", `not a git repository: ${cwd} (run jev-pref review inside one)`);
  }
  const head = await hasHead(root);
  // Default exclusions keep generated lockfiles out of the Jev context;
  // --include replaces the "." root (pathspecs OR, so additive includes
  // would expand, not restrict); --exclude appends exclusions on top.
  const lockExcludes = [":!package-lock.json", ":!pnpm-lock.yaml", ":!yarn.lock", ":!bun.lockb"];
  const roots = include.length > 0 ? include.map((g) => `:(glob)${g}`) : ["."];
  const excludes = [...lockExcludes, ...exclude.map((g) => `:(exclude,glob)${g}`)];
  const scope = ["--", ...roots, ...excludes];
  let rawDiff;
  const workingTree = !staged && ref == null;
  if (staged) {
    rawDiff = await runGit(["diff", "--cached", ...scope], root);
  } else if (ref != null) {
    rawDiff = await runGit(["diff", ref, ...scope], root);
  } else if (head) {
    rawDiff = await runGit(["diff", "HEAD", ...scope], root);
  } else {
    const unstaged = await runGit(["diff", ...scope], root);
    const cached = await runGit(["diff", "--cached", ...scope], root);
    rawDiff = unstaged + cached;
  }
  const status = await runGit(["status", "--porcelain", ...scope], root);
  // Untracked files belong to working-tree scope only. In --staged / --diff /
  // --pr scope they would judge code the scope explicitly excludes.
  const untracked = workingTree
    ? (await runGit(["ls-files", "--others", "--exclude-standard", ...scope], root)).trim()
    : "";
  const statOut = ref != null
    ? await runGit(["diff", "--stat", ref, ...scope], root)
    : staged
    ? await runGit(["diff", "--cached", "--stat", "HEAD", ...scope], root).catch(() => "")
    : head
    ? await runGit(["diff", "--stat", "HEAD", ...scope], root)
    : await runGit(["status", "--short", ...scope], root).catch(() => "");
  const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], root).then(
    (b) => b.trim(),
    () => "(unknown)",
  );
  let diff = rawDiff.slice(0, maxDiffChars);
  let truncated = rawDiff.length > maxDiffChars;
  let untrackedSections = [];
  if (untracked !== "") {
    const extra = await untrackedContent(root, untracked, maxDiffChars - diff.length);
    if (extra.text !== "") {
      const combined = diff !== "" ? diff + "\n" + extra.text : extra.text;
      diff = combined.slice(0, maxDiffChars);
      truncated = truncated || combined.length > maxDiffChars;
      untrackedSections = extra.sections;
    }
  }
  return {
    diff,
    truncated,
    status: status.trim(),
    untracked,
    untrackedSections,
    stat: statOut.trim(),
    branch,
    scope: staged ? "staged" : ref ?? "working-tree",
  };
}
