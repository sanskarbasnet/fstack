import { execSync } from "node:child_process";

function gitOut(args: string[], cwd: string = process.cwd()): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function currentBranch(cwd?: string): string | null {
  const b = gitOut(["branch", "--show-current"], cwd);
  return b || null;
}

/** Canonical repo identity: 'github.com/org/name' (no scheme, no .git). */
export function canonicalRemote(cwd?: string): string | null {
  const url = gitOut(["config", "--get", "remote.origin.url"], cwd);
  if (!url) return null;
  // git@github.com:foo/bar.git OR https://github.com/foo/bar.git OR https://github.com/foo/bar
  let m = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (m) return `${m[1]}/${m[2]}`;
  m = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}

export function repoRoot(cwd?: string): string | null {
  const r = gitOut(["rev-parse", "--show-toplevel"], cwd);
  return r || null;
}

/** Files with uncommitted changes (working tree + index). */
export function uncommittedFiles(cwd?: string): string[] {
  const out = gitOut(["status", "--porcelain"], cwd);
  if (!out) return [];
  return out
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

/** Files changed in `git diff base...HEAD`. */
export function changedFilesSinceBase(base: string = "main", cwd?: string): string[] {
  const out = gitOut(["diff", "--name-only", `${base}...HEAD`], cwd);
  if (!out) return [];
  return out.split("\n").filter(Boolean);
}

export function defaultBranch(cwd?: string): string {
  const out = gitOut(
    ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
    cwd
  );
  if (out.startsWith("origin/")) return out.slice("origin/".length);
  return "main";
}
