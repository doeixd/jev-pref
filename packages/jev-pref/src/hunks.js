// Unified-diff hunk splitter. Turns a `git diff` into per-file, per-hunk
// units with new-side line ranges, so Jev judges each hunk in isolation and
// verdicts carry file:line attribution (powers true inline PR comments).
// Filenames with spaces are handled via the `+++ b/` line (dequoted).

/**
 * @returns {Array<{file: string, start: number, count: number, header: string, body: string}>}
 * start/count are new-file line numbers (count may be 0 for pure deletions).
 */
export function splitHunks(diff) {
  const hunks = [];
  let file = null;
  let header = "";
  let current = null;
  const flush = () => {
    if (current) {
      current.body = current.lines.join("\n");
      delete current.lines;
      hunks.push(current);
      current = null;
    }
  };
  for (const line of diff.split("\n")) {
    let m;
    if (line.startsWith("diff --git ")) {
      flush();
      // Quote-aware: paths with spaces arrive quoted ("a/my file.ts").
      // b/ side is the new name (handles renames); +++ below refines it.
      const parts = tokenizeGitDiffLine(line.slice("diff --git ".length));
      file = dequote(parts[parts.length - 1] ?? "").replace(/^b\//, "");
      header = line;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const name = dequote(line.slice(4).trim());
      if (name !== "/dev/null") file = name.replace(/^b\//, "");
      header += "\n" + line;
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("index ") || line.startsWith("new file") ||
        line.startsWith("deleted ") || line.startsWith("similarity ") || line.startsWith("rename ")) {
      header += "\n" + line;
      continue;
    }
    m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (m) {
      flush();
      current = {
        file: file ?? "(unknown)",
        start: Number(m[1]),
        count: m[2] === undefined ? 1 : Number(m[2]),
        header: `${header}\n${line}`.trim(),
        lines: [line],
      };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return hunks;
}

/** Split a unified diff into complete per-file sections. */
export function splitFiles(diff) {
  const files = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    current.body = current.lines.join("\n");
    delete current.lines;
    files.push(current);
    current = null;
  };
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      const parts = tokenizeGitDiffLine(line.slice("diff --git ".length));
      current = {
        file: dequote(parts[parts.length - 1] ?? "").replace(/^b\//, "") || "(unknown)",
        lines: [line],
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++ ")) {
      const name = dequote(line.slice(4).trim());
      if (name !== "/dev/null") current.file = name.replace(/^b\//, "");
    }
    current.lines.push(line);
  }
  flush();
  return files;
}

/** Split a `diff --git` remainder into paths, honoring C-style quotes. */
function tokenizeGitDiffLine(s) {
  const out = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === "\\" && i + 1 < s.length) cur += s[++i];
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === " ") {
      if (cur !== "") {
        out.push(cur);
        cur = "";
      }
    } else {
      cur += c;
    }
  }
  if (cur !== "") out.push(cur);
  return out;
}

function dequote(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

/** Compact label for verdicts and inline comments. */
export function hunkLabel(h) {
  const end = h.count <= 0 ? h.start : h.start + h.count - 1;
  return `${h.file}:${h.start}-${end}`;
}
