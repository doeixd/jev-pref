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
      out.push(`--- new file: ${f} ---\n${content}`);
    } catch {
      out.push(`--- new file: ${f} (unreadable, skipped) ---`);
    }
  }
  return out.join("\n");
}

/**
 * Collect review state.
 * @param {object} opts - { ref?: string|null, staged?: boolean, maxDiffChars }
 * ref = explicit git ref/range (allowlisted); staged = --cached only.
 */
export async function collectState({ cwd = ".", ref = null, staged = false, maxDiffChars = 24000 } = {}) {
  if (ref != null && !SAFE_REF.test(ref)) throw new UnsafeRefError(ref);
  // Anchor at the repo root: pathspecs and untracked listings are cwd-scoped.
  let root;
  try {
    root = (await runGit(["rev-parse", "--show-toplevel"], cwd)).trim();
  } catch {
    root = cwd;
  }
  const head = await hasHead(root);
  const scope = ["--", ".", ":!package-lock.json", ":!pnpm-lock.yaml"];
  let rawDiff;
  if (staged) {
    rawDiff = await runGit(["diff", "--cached", "--", ".", ":!package-lock.json", ":!pnpm-lock.yaml"], root);
  } else if (ref != null) {
    rawDiff = await runGit(["diff", ref, ...scope], root);
  } else if (head) {
    rawDiff = await runGit(["diff", "HEAD", ...scope], root);
  } else {
    const unstaged = await runGit(["diff", ...scope], root);
    const cached = await runGit(["diff", "--cached", ...scope], root);
    rawDiff = unstaged + cached;
  }
  const status = await runGit(["status", "--porcelain"], root);
  const untracked = (await runGit(["ls-files", "--others", "--exclude-standard"], root)).trim();
  const statOut = ref != null
    ? await runGit(["diff", "--stat", ref], root)
    : staged
    ? await runGit(["diff", "--cached", "--stat", "HEAD"], root).catch(() => "")
    : head
    ? await runGit(["diff", "--stat", "HEAD"], root)
    : await runGit(["status", "--short"], root);
  const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], root).then(
    (b) => b.trim(),
    () => "(unknown)",
  );
  let diff = rawDiff.slice(0, maxDiffChars);
  let truncated = rawDiff.length > maxDiffChars;
  if (untracked !== "") {
    const extra = await untrackedContent(root, untracked, maxDiffChars - diff.length);
    if (extra !== "") {
      const combined = diff !== "" ? diff + "\n" + extra : extra;
      diff = combined.slice(0, maxDiffChars);
      truncated = truncated || combined.length > maxDiffChars;
    }
  }
  return {
    diff,
    truncated,
    status: status.trim(),
    untracked,
    stat: statOut.trim(),
    branch,
    scope: staged ? "staged" : ref ?? "working-tree",
  };
}
