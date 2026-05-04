import fs from "node:fs/promises";
import path from "node:path";
import type { RunRequest, RunResponse } from "./types.js";
import { CostTracker } from "./cost.js";
import { runAgent } from "./agent.js";
import {
  ensureRepo,
  openRepo,
  remoteBranchExists,
  listDirtyFiles,
  resetToClean,
  commitAndPushFix,
} from "./git.js";
import { openPullRequest, mergePullRequest } from "./github.js";

export interface RunnerInput {
  request: RunRequest;
  anthropicApiKey: string;
  githubToken: string | null;
}

function safeBranchSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
}

function appendNote(md: string, note: string): string {
  const sep = md.endsWith("\n") ? "" : "\n";
  return `${md}${sep}\n---\n_Note from sidecar:_ ${note}\n`;
}

export async function runOnce(input: RunnerInput): Promise<RunResponse> {
  const { request, anthropicApiKey, githubToken } = input;
  const { repo, ticket, model, hardCostCapUsd } = request;
  const startedAt = Date.now();
  const cost = new CostTracker(model);

  const baseResponse = (
    overrides: Partial<RunResponse> & Pick<RunResponse, "status" | "analysisMarkdown">,
  ): RunResponse => {
    const snap = cost.snapshot();
    return {
      status: overrides.status,
      analysisMarkdown: overrides.analysisMarkdown,
      prUrl: overrides.prUrl ?? null,
      branchName: overrides.branchName ?? null,
      tokensIn: snap.tokensIn,
      tokensOut: snap.tokensOut,
      costUsd: snap.costUsd,
      durationMs: Date.now() - startedAt,
      errorMessage: overrides.errorMessage ?? null,
    };
  };

  // 1. Resolve a usable local clone — clone-on-demand from GitHub when the
  // caller passed a URL (the prod Container App pattern) or fetch latest
  // into a cached working dir (the dev local-path pattern).
  let resolvedPath: string;
  try {
    resolvedPath = await ensureRepo({
      repoPath: repo.path,
      githubOwner: repo.githubOwner,
      githubRepo: repo.githubRepo,
      githubToken,
    });
  } catch (err) {
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: "",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Open the repo and check the worktree is clean before we start.
  let ops;
  try {
    ops = await openRepo(resolvedPath);
  } catch (err) {
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: "",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // 2.5 Pre-flight checks — every failure mode that's already cost us
  // dollars (~$20/incident) needs to fail here at $0 instead of after the
  // agent has burned tokens. Every check below runs in <500ms and only
  // proceeds to the expensive runAgent() call if all are green.
  //   (a) origin/<devBranch> resolves to a remote head — caught the
  //       "fatal: 'origin/dev' is not a commit" $18 incident.
  //   (b) git committer identity is configured — caught the
  //       "Author identity unknown" $4.83 incident.
  //   (c) GitHub auth is wired up at all — clone got us this far so
  //       this is mostly belt-and-suspenders, but a bad token still
  //       slips past clone if the repo is public-readable but
  //       write-locked. (We can't cheaply test push without actually
  //       pushing, so this is the best free pre-check.)
  const preflightFailures: string[] = [];

  // (a) devBranch reachability on remote.
  try {
    const lsOut = await ops.git.raw([
      "ls-remote",
      "--heads",
      "origin",
      repo.devBranch,
    ]);
    if (!lsOut.trim()) {
      preflightFailures.push(
        `dev branch '${repo.devBranch}' does not exist on origin (${repo.githubOwner}/${repo.githubRepo}). Create it before assigning Claude.`,
      );
    }
  } catch (err) {
    preflightFailures.push(
      `Could not list remote branches: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // (b) git committer identity baked in (Dockerfile sets these; defensive).
  try {
    const userEmail = (await ops.git.raw(["config", "user.email"]).catch(() => "")).trim();
    const userName = (await ops.git.raw(["config", "user.name"]).catch(() => "")).trim();
    if (!userEmail || !userName) {
      preflightFailures.push(
        `git committer identity not configured (user.email='${userEmail}', user.name='${userName}'). Sidecar Dockerfile should bake these in.`,
      );
    }
  } catch (err) {
    preflightFailures.push(
      `Could not read git config: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // (c) Token presence — caller-controlled, so it ranges from "unset"
  // (anonymous clone of public repo worked) to "set but limited" (push
  // will fail later). We can only cheaply check presence; push perms
  // require an actual push attempt.
  if (!githubToken) {
    preflightFailures.push(
      "No GitHub credential configured. Either populate the github-token KV secret with a fine-grained PAT (Contents+Pull-requests R/W) or migrate to the GitHub App pattern.",
    );
  }

  if (preflightFailures.length > 0) {
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: "",
      errorMessage:
        "Pre-flight checks failed (no agent run, no token cost):\n  - " +
        preflightFailures.join("\n  - "),
    });
  }

  // 3. Check whether the dev branch exists on remote.
  const devExists = await remoteBranchExists(ops, repo.devBranch);

  // 4. Run the agent. CRITICAL: pass the LOCAL clone path (resolvedPath),
  // not the original repo.path which is a https://... URL when callers
  // come through the prod tenant resolver. agent.ts uses repo.path as the
  // working directory; without this swap it does
  // `fs.access('/app/https:/...')` and ENOENTs.
  const localRepo = { ...repo, path: resolvedPath };
  let agentResult;
  try {
    agentResult = await runAgent({
      repo: localRepo,
      ticket,
      model,
      hardCostCapUsd,
      cost,
      anthropicApiKey,
    });
  } catch (err) {
    // Make sure we don't leave the worktree dirty.
    await resetToClean(ops).catch(() => undefined);
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: "",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // 5. Snapshot what the agent changed.
  let dirty: string[] = [];
  try {
    dirty = await listDirtyFiles(ops);
  } catch (err) {
    await resetToClean(ops).catch(() => undefined);
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: agentResult.analysisMarkdown,
      errorMessage: `git status failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  // 6. Decide what to do based on cap, dirtiness, dev-branch presence, token presence.
  if (agentResult.capped) {
    // Always discard partial edits when capped.
    await resetToClean(ops).catch(() => undefined);
    return baseResponse({
      status: "CAPPED",
      analysisMarkdown: appendNote(
        agentResult.analysisMarkdown,
        `Run aborted at cost cap $${hardCostCapUsd}; partial analysis returned.`,
      ),
      errorMessage: null,
    });
  }

  if (agentResult.finishReason === "error") {
    await resetToClean(ops).catch(() => undefined);
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: agentResult.analysisMarkdown,
      errorMessage: agentResult.errorMessage ?? "Agent ended in error.",
    });
  }

  if (dirty.length === 0) {
    return baseResponse({
      status: "SUCCEEDED",
      analysisMarkdown: appendNote(
        agentResult.analysisMarkdown,
        "Agent did not modify any files; no PR opened.",
      ),
    });
  }

  if (!devExists) {
    await resetToClean(ops).catch(() => undefined);
    return baseResponse({
      status: "SUCCEEDED",
      analysisMarkdown: appendNote(
        agentResult.analysisMarkdown,
        `No PR opened: dev branch \`${repo.devBranch}\` does not exist on origin. ` +
          `Returning analysis-only.`,
      ),
    });
  }

  if (!githubToken) {
    await resetToClean(ops).catch(() => undefined);
    return baseResponse({
      status: "SUCCEEDED",
      analysisMarkdown: appendNote(
        agentResult.analysisMarkdown,
        "No PR opened: GITHUB_TOKEN not configured on the sidecar.",
      ),
    });
  }

  // 7. Commit + push + open PR.
  const branchName = `claude/bug-${ticket.id}-${safeBranchSegment(
    String(Date.now()).slice(-6),
  )}`;
  const commitTitle = `[Bug #${ticket.id}] ${ticket.title}`;
  const commitBody = `Proposed by Claude via Bugs Managed.

Files touched:
${dirty.map((f) => `  - ${f}`).join("\n")}
`;

  let pushedBranch: string;
  try {
    pushedBranch = await commitAndPushFix({
      ops,
      devBranch: repo.devBranch,
      newBranch: branchName,
      commitTitle,
      commitBody,
    });
  } catch (err) {
    await resetToClean(ops).catch(() => undefined);
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: agentResult.analysisMarkdown,
      errorMessage: `git push failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  const prBody = [
    agentResult.analysisMarkdown,
    "",
    "---",
    "",
    `### Original ticket #${ticket.id}`,
    "",
    ticket.description ? `**Description:**\n\n${ticket.description}\n` : "",
    ticket.transcript ? `**Reporter transcript:**\n\n${ticket.transcript}\n` : "",
    ticket.consoleErrors
      ? `**Console errors:**\n\n\`\`\`\n${ticket.consoleErrors}\n\`\`\`\n`
      : "",
    "---",
    "",
    `_Generated by Claude Agent SDK from Bugs Managed ticket #${ticket.id}._`,
  ]
    .filter(Boolean)
    .join("\n");

  let prUrl: string;
  let prNumber: number;
  try {
    const opened = await openPullRequest(githubToken, {
      owner: repo.githubOwner,
      repo: repo.githubRepo,
      baseBranch: repo.devBranch,
      headBranch: pushedBranch,
      title: `[Bug #${ticket.id}] ${ticket.title} — proposed by Claude`,
      body: prBody,
    });
    prUrl = opened.url;
    prNumber = opened.number;
  } catch (err) {
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: agentResult.analysisMarkdown,
      branchName: pushedBranch,
      errorMessage: `Opening PR failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  } finally {
    // Always reset the local worktree — the PR is the artifact.
    await resetToClean(ops).catch(() => undefined);
  }

  // 8. Auto-merge to dev. The platform owner is non-coder; they approve by
  // exercising the change in the dev environment, not by reading the diff.
  // Promotion dev→main remains a separate human-gated step.
  const mergeResult = await mergePullRequest(githubToken, {
    owner: repo.githubOwner,
    repo: repo.githubRepo,
    prNumber,
    baseBranch: repo.devBranch,
    commitTitle: `${commitTitle} (Claude #${ticket.id})`,
    commitMessage: `Auto-merged by Bugs Managed sidecar.\n\nPR: ${prUrl}\nFiles touched:\n${dirty
      .map((f) => `  - ${f}`)
      .join("\n")}`,
  });

  const mergeNote = mergeResult.merged
    ? `Auto-merged into \`${repo.devBranch}\` (${mergeResult.sha?.slice(0, 7)}). The dev environment will redeploy on the next CI run — exercise the change there to approve.`
    : `PR opened but auto-merge skipped: ${mergeResult.reason ?? "unknown"}. Merge manually from GitHub once any required checks pass.`;

  return baseResponse({
    status: "SUCCEEDED",
    analysisMarkdown: appendNote(agentResult.analysisMarkdown, mergeNote),
    prUrl,
    branchName: pushedBranch,
  });
}

// Re-export for tests.
export const _internal = { safeBranchSegment, appendNote, path };
