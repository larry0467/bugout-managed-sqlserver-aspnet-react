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
): Promise<string> {
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
  return pr.data.html_url;
}
