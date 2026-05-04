import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { simpleGit, SimpleGit } from "simple-git";
import { PROTECTED_BRANCHES } from "./types.js";

export interface GitOps {
  git: SimpleGit;
  repoPath: string;
}

export async function openRepo(repoPath: string): Promise<GitOps> {
  const stat = await fs.stat(repoPath).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`RepoPath not found: ${repoPath}`);
  }
  const git = simpleGit({ baseDir: repoPath });
  // Sanity: confirm it really is a git repo.
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) throw new Error(`Not a git repository: ${repoPath}`);
  return { git, repoPath };
}

/**
 * Ensure a usable local clone of the requested repo exists on disk and
 * return its path. Three cases:
 *
 *   1. `repoPath` is an absolute filesystem path that already contains a
 *      git repo (the dev seeder pattern). Use as-is.
 *   2. `repoPath` is a URL or a non-existent path, AND `githubOwner`+
 *      `githubRepo` are set. Clone into a deterministic cache dir under
 *      `$TMPDIR/bugout-agent-repos/{owner}-{repo}` if missing, otherwise
 *      `git fetch` to pull latest.
 *   3. Neither — throw, the caller surfaces the error.
 *
 * Auth: if `githubToken` is provided, the clone URL embeds it as
 * `x-access-token`. Without it, clone will succeed for public repos and
 * fail loudly for private ones.
 */
export async function ensureRepo(opts: {
  repoPath: string;
  githubOwner: string | null | undefined;
  githubRepo: string | null | undefined;
  githubToken: string | null | undefined;
}): Promise<string> {
  const { repoPath, githubOwner, githubRepo, githubToken } = opts;

  // Case 1: caller passed a real local path that already exists.
  if (path.isAbsolute(repoPath)) {
    const stat = await fs.stat(repoPath).catch(() => null);
    if (stat?.isDirectory()) {
      const isRepo = await simpleGit({ baseDir: repoPath })
        .checkIsRepo()
        .catch(() => false);
      if (isRepo) return repoPath;
    }
  }

  // Case 2: clone (or fetch) into a cache dir keyed by owner/repo.
  if (!githubOwner || !githubRepo) {
    throw new Error(
      `Cannot resolve repo: path "${repoPath}" is not a usable local clone, ` +
        `and no githubOwner/githubRepo provided to clone from.`,
    );
  }

  const cacheRoot = path.join(os.tmpdir(), "bugout-agent-repos");
  await fs.mkdir(cacheRoot, { recursive: true });
  const localPath = path.join(cacheRoot, `${githubOwner}-${githubRepo}`);

  // Build clone URL; embed token only when one is configured (and not the
  // terraform placeholder).
  const tokenIsReal =
    !!githubToken && !githubToken.startsWith("placeholder");
  const cloneUrl = tokenIsReal
    ? `https://x-access-token:${githubToken}@github.com/${githubOwner}/${githubRepo}.git`
    : `https://github.com/${githubOwner}/${githubRepo}.git`;

  // Clone flags:
  //   --depth=50         shallow, ~50 commits per branch (sufficient for
  //                      branch-off-of-dev workflows, fast)
  //   --no-single-branch git's default with --depth is to track only the
  //                      remote default branch, which means `origin/dev`
  //                      never gets a remote-tracking ref even after fetch.
  //                      That breaks `commitAndPushFix` which checks out
  //                      origin/<devBranch>. --no-single-branch tracks
  //                      every remote head so any devBranch resolves.
  const cloneArgs = ["--depth=50", "--no-single-branch"];

  const localStat = await fs.stat(localPath).catch(() => null);
  if (!localStat) {
    await simpleGit().clone(cloneUrl, localPath, cloneArgs);
    return localPath;
  }

  // Already cloned — make sure remote URL is current (token may have
  // rotated) and fetch latest. Belt-and-suspenders: if a previous clone
  // was made with the old single-branch behaviour, repair its fetch
  // refspec to the multi-branch form before fetching.
  try {
    const git = simpleGit({ baseDir: localPath });
    await git.remote(["set-url", "origin", cloneUrl]);
    await git.raw(["config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"]);
    await git.fetch(["origin", "--prune"]);
    return localPath;
  } catch {
    await fs.rm(localPath, { recursive: true, force: true });
    await simpleGit().clone(cloneUrl, localPath, cloneArgs);
    return localPath;
  }
}

/** Verify a branch exists on `origin`. Used to gate PR creation. */
export async function remoteBranchExists(
  ops: GitOps,
  branch: string,
): Promise<boolean> {
  try {
    const out = await ops.git.listRemote(["--heads", "origin", branch]);
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** Throws if the caller tries to operate on a protected branch. */
export function assertWritableBranch(branch: string): void {
  const lower = branch.toLowerCase();
  if (PROTECTED_BRANCHES.includes(lower)) {
    throw new Error(
      `SAFETY: refusing to operate on protected branch "${branch}". ` +
        `Allowed write targets exclude main/master/demo/beta/prod.`,
    );
  }
}

/** Snapshot the list of files modified or added since HEAD. */
export async function listDirtyFiles(ops: GitOps): Promise<string[]> {
  const status = await ops.git.status();
  const files = new Set<string>();
  for (const f of status.modified) files.add(f);
  for (const f of status.created) files.add(f);
  for (const f of status.not_added) files.add(f);
  for (const f of status.renamed) files.add(f.to);
  for (const f of status.deleted) files.add(f);
  return Array.from(files);
}

/** Discard every uncommitted change so the worktree is clean again. */
export async function resetToClean(ops: GitOps): Promise<void> {
  // Order matters: stash any in-progress, then reset, then clean untracked.
  await ops.git.reset(["--hard", "HEAD"]).catch(() => undefined);
  await ops.git.clean("f", ["-d"]).catch(() => undefined);
}

/**
 * Create a fresh local branch off `origin/<devBranch>`, commit all current
 * working-tree changes onto it, and push to origin.
 *
 * Returns the branch name actually pushed.
 */
export async function commitAndPushFix(opts: {
  ops: GitOps;
  devBranch: string;
  newBranch: string;
  commitTitle: string;
  commitBody: string;
}): Promise<string> {
  const { ops, devBranch, newBranch, commitTitle, commitBody } = opts;

  assertWritableBranch(devBranch); // dev itself must not be protected
  assertWritableBranch(newBranch); // and the new branch we create

  // Stash any uncommitted work the agent produced so we can switch branches.
  const status = await ops.git.status();
  const dirty = status.files.length > 0;
  if (dirty) {
    await ops.git.stash(["push", "-u", "-m", "claude-agent-temp"]);
  }

  await ops.git.fetch(["origin", devBranch]);
  // Create the working branch from origin/<devBranch>.
  await ops.git.checkout(["-B", newBranch, `origin/${devBranch}`]);

  if (dirty) {
    await ops.git.stash(["pop"]);
  }

  await ops.git.add(["-A"]);
  const message = `${commitTitle}\n\n${commitBody}`;
  await ops.git.commit(message);
  await ops.git.push(["-u", "origin", newBranch]);

  return newBranch;
}

/**
 * Best-effort safety check: ensure a path is inside `repoPath` (no symlink
 * traversal, no `..` escapes). We use this when scoping tools.
 */
export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}
