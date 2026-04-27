import fs from "node:fs/promises";
import path from "node:path";
import type { RunRequest, RunResponse } from "./types.js";
import { CostTracker } from "./cost.js";
import { runAgent } from "./agent.js";
import {
  openRepo,
  remoteBranchExists,
  listDirtyFiles,
  resetToClean,
  commitAndPushFix,
} from "./git.js";
import { openPullRequest } from "./github.js";

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

  // 1. Validate repo path exists.
  try {
    const stat = await fs.stat(repo.path);
    if (!stat.isDirectory()) throw new Error("not a directory");
  } catch {
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: "",
      errorMessage: `RepoPath not found: ${repo.path}`,
    });
  }

  // 2. Open the repo and check the worktree is clean before we start.
  let ops;
  try {
    ops = await openRepo(repo.path);
  } catch (err) {
    return baseResponse({
      status: "FAILED",
      analysisMarkdown: "",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Check whether the dev branch exists on remote.
  const devExists = await remoteBranchExists(ops, repo.devBranch);

  // 4. Run the agent.
  let agentResult;
  try {
    agentResult = await runAgent({
      repo,
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
  try {
    prUrl = await openPullRequest(githubToken, {
      owner: repo.githubOwner,
      repo: repo.githubRepo,
      baseBranch: repo.devBranch,
      headBranch: pushedBranch,
      title: `[Bug #${ticket.id}] ${ticket.title} — proposed by Claude`,
      body: prBody,
    });
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

  return baseResponse({
    status: "SUCCEEDED",
    analysisMarkdown: agentResult.analysisMarkdown,
    prUrl,
    branchName: pushedBranch,
  });
}

// Re-export for tests.
export const _internal = { safeBranchSegment, appendNote, path };
