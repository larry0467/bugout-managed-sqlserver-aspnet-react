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
