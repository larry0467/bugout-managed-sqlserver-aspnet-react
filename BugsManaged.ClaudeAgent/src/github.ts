import { Octokit } from "@octokit/rest";
import { PROTECTED_BRANCHES } from "./types.js";

export interface OpenPrInput {
  owner: string;
  repo: string;
  baseBranch: string; // must be devBranch
  headBranch: string; // claude/bug-{id}
  title: string;
  body: string;
}

export async function openPullRequest(
  token: string,
  input: OpenPrInput,
): Promise<{ url: string; number: number }> {
  // Defense in depth: the *base* of any PR we open must be the dev branch the
  // caller passed, never a protected branch.
  if (PROTECTED_BRANCHES.includes(input.baseBranch.toLowerCase())) {
    throw new Error(
      `SAFETY: refusing to open PR with base="${input.baseBranch}" — protected branch.`,
    );
  }
  if (PROTECTED_BRANCHES.includes(input.headBranch.toLowerCase())) {
    throw new Error(
      `SAFETY: refusing to open PR with head="${input.headBranch}" — protected branch.`,
    );
  }

  const octokit = new Octokit({ auth: token });
  const pr = await octokit.pulls.create({
    owner: input.owner,
    repo: input.repo,
    title: input.title,
    head: input.headBranch,
    base: input.baseBranch,
    body: input.body,
    maintainer_can_modify: true,
    draft: false,
  });
  return { url: pr.data.html_url, number: pr.data.number };
}

export interface MergePrInput {
  owner: string;
  repo: string;
  prNumber: number;
  baseBranch: string; // for safety re-check
  commitTitle: string;
  commitMessage: string;
}

export interface MergeResult {
  merged: boolean;
  sha?: string;
  reason?: string; // populated when merged === false
}

/**
 * Squash-merge the PR into the dev branch and delete the head branch.
 *
 * Why auto-merge: the platform owner is a non-coder. They approve changes by
 * exercising them in the dev environment, not by reading diffs. So every
 * Claude PR ships to dev immediately; promotion dev→main is still gated by a
 * human button click.
 *
 * Failure modes that legitimately leave the PR open for manual review:
 *   - branch protection requires status checks that haven't run yet
 *   - reviewers are required
 *   - merge conflict (rare since we just branched off dev)
 *   - token lacks contents:write on the target repo
 * In all of those cases we return { merged: false, reason } and keep the PR
 * open. We do NOT throw — the run already succeeded, the PR is the artifact.
 */
export async function mergePullRequest(
  token: string,
  input: MergePrInput,
): Promise<MergeResult> {
  if (PROTECTED_BRANCHES.includes(input.baseBranch.toLowerCase())) {
    return {
      merged: false,
      reason: `SAFETY: refusing to auto-merge into protected branch "${input.baseBranch}".`,
    };
  }

  const octokit = new Octokit({ auth: token });

  try {
    const res = await octokit.pulls.merge({
      owner: input.owner,
      repo: input.repo,
      pull_number: input.prNumber,
      merge_method: "squash",
      commit_title: input.commitTitle,
      commit_message: input.commitMessage,
    });
    return { merged: true, sha: res.data.sha };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return {
      merged: false,
      reason: `GitHub merge API responded ${e.status ?? "?"}: ${
        e.message ?? String(err)
      }`,
    };
  }
}
