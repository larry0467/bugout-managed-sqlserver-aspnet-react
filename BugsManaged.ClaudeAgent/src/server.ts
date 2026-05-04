import "dotenv/config";
import { readFileSync } from "node:fs";
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { RunRequestSchema, type RunResponse } from "./types.js";
import { runOnce } from "./runner.js";
import { getInstallationToken, readGitHubAppCredentials } from "./githubAuth.js";

const PORT = Number(process.env.PORT ?? 7100);
const SIDECAR_KEY = process.env.CLAUDE_AGENT_SIDECAR_API_KEY ?? "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// GitHub auth is per-run: we mint a fresh installation token at the start
// of every /run call. Falls back to legacy GITHUB_TOKEN PAT if a customer
// hasn't migrated to the App pattern yet (deprecated; SOC 2 requires App).
const LEGACY_PAT = process.env.GITHUB_TOKEN ?? "";

const PKG_VERSION = (() => {
  try {
    const url = new URL("../package.json", import.meta.url);
    const data = readFileSync(url, "utf8");
    const parsed = JSON.parse(data) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const app = express();
app.use(express.json({ limit: "2mb" }));

function authGuard(req: Request, res: Response, next: NextFunction): void {
  if (!SIDECAR_KEY) {
    res
      .status(500)
      .json({ error: "Server misconfigured: CLAUDE_AGENT_SIDECAR_API_KEY not set" });
    return;
  }
  const provided = req.header("X-Claude-Agent-Key") ?? "";
  if (provided !== SIDECAR_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, version: PKG_VERSION });
});

app.post("/run", authGuard, async (req: Request, res: Response) => {
  const parse = RunRequestSchema.safeParse(req.body);
  if (!parse.success) {
    const issues = parse.error.issues
      .map((i: z.core.$ZodIssue) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    res.status(400).json({ error: `Invalid request body: ${issues}` });
    return;
  }
  if (!ANTHROPIC_KEY) {
    const failed: RunResponse = {
      status: "FAILED",
      analysisMarkdown: "",
      prUrl: null,
      branchName: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durationMs: 0,
      errorMessage: "ANTHROPIC_API_KEY not set on the sidecar",
    };
    res.status(200).json(failed);
    return;
  }

  // Mint a fresh GitHub App installation token for this run (preferred;
  // 1-hour lifetime, App-scoped, audit-logged by GitHub). Fall back to a
  // legacy PAT only if no App credentials are configured — that path is
  // deprecated and emits a warning so we know to migrate the tenant.
  let githubToken: string | null = null;
  try {
    githubToken = await getInstallationToken();
    if (!githubToken && LEGACY_PAT) {
      // eslint-disable-next-line no-console
      console.warn(
        "[bugs-managed-claude-agent] using legacy GITHUB_TOKEN PAT — migrate to GitHub App for SOC 2",
      );
      githubToken = LEGACY_PAT;
    }
  } catch (err) {
    const failed: RunResponse = {
      status: "FAILED",
      analysisMarkdown: "",
      prUrl: null,
      branchName: null,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durationMs: 0,
      errorMessage:
        "GitHub App token exchange failed: " +
        (err instanceof Error ? err.message : String(err)),
    };
    res.status(200).json(failed);
    return;
  }

  try {
    const result = await runOnce({
      request: parse.data,
      anthropicApiKey: ANTHROPIC_KEY,
      githubToken,
    });
    res.status(200).json(result);
  } catch (err) {
    // Anything reaching here is genuinely catastrophic — return 500 per the spec.
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Sidecar internal error: ${message}` });
  }
});

// /promote — fires the prod deploy for the apps that ship straight from
// Approve & ship in the admin (cockpit, bugs-managed itself). The Bugs
// Managed API calls this when the platform owner approves a Claude
// ticket whose repo is configured to auto-promote.
//
// What it does:
//   1. Merge fromBranch into toBranch via the GitHub merge API.
//   2. If tagOnPromote is true, create a v{yyyyMMddHHmmss} tag pointing
//      at the new tip — that's what fires the cockpit's prod deploy
//      workflow (its deploy.yml is gated on tag pushes, not main).
//
// We DO NOT route this through the sidecar's PROTECTED_BRANCHES check
// the way openPullRequest does — promoting into main/master is the
// intended use of this endpoint.
const PromoteRequestSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  fromBranch: z.string().min(1),
  toBranch: z.string().min(1),
  tagOnPromote: z.boolean().optional().default(false),
  reason: z.string().optional(),
});

app.post("/promote", authGuard, async (req: Request, res: Response) => {
  const parse = PromoteRequestSchema.safeParse(req.body);
  if (!parse.success) {
    const issues = parse.error.issues
      .map((i: z.core.$ZodIssue) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    res.status(400).json({ error: `Invalid promote body: ${issues}` });
    return;
  }
  const { owner, repo, fromBranch, toBranch, tagOnPromote, reason } = parse.data;

  let githubToken: string | null = null;
  try {
    githubToken = await getInstallationToken();
    if (!githubToken && LEGACY_PAT) githubToken = LEGACY_PAT;
  } catch (err) {
    res.status(500).json({
      error: `GitHub token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  if (!githubToken) {
    res.status(500).json({ error: "No GitHub token available on sidecar" });
    return;
  }

  const octokit = new Octokit({ auth: githubToken });

  // Step 1: merge fromBranch into toBranch. GitHub returns 201 with a
  // commit body for a real merge or 204 when toBranch already contains
  // fromBranch (nothing to do). In either case we resolve the tip of
  // toBranch afterwards so the tag step has the right sha — this also
  // sidesteps Octokit's type narrowing which only models the 201 path.
  try {
    await octokit.repos.merge({
      owner,
      repo,
      base: toBranch,
      head: fromBranch,
      commit_message:
        `Promote ${fromBranch} -> ${toBranch} via Bugs Managed Approve & ship` +
        (reason ? `\n\n${reason}` : ""),
    });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    // 204 surfaces as a "Not Modified"-style error in some Octokit
    // versions because the typings don't model it; treat it as a no-op
    // success and continue to the tip-resolution step.
    if (e.status !== 204) {
      res.status(409).json({
        error: `Merge ${fromBranch} -> ${toBranch} failed: HTTP ${e.status ?? "?"} — ${
          e.message ?? String(err)
        }`,
      });
      return;
    }
  }

  let mergeSha: string;
  try {
    const ref = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${toBranch}`,
    });
    mergeSha = ref.data.object.sha;
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(500).json({
      error: `Merged but could not resolve tip of ${toBranch}: HTTP ${e.status ?? "?"} — ${
        e.message ?? String(err)
      }`,
    });
    return;
  }

  // Step 2: optional v-tag at the merge tip — fires tag-gated prod deploys.
  let tagName: string | null = null;
  if (tagOnPromote) {
    const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    tagName = `v${ts}`;
    try {
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/tags/${tagName}`,
        sha: mergeSha,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      // The merge already happened — surface the tag failure but report
      // both pieces of state so the API can decide whether to retry just
      // the tag or call this a partial success.
      res.status(502).json({
        mergeSha,
        tagName: null,
        error: `Merge succeeded but tag push failed: HTTP ${e.status ?? "?"} — ${
          e.message ?? String(err)
        }`,
      });
      return;
    }
  }

  res.status(200).json({ mergeSha, tagName });
});

app.listen(PORT, () => {
  const appCreds = readGitHubAppCredentials();
  const authMode = appCreds
    ? `GitHub App (id=${appCreds.appId}, install=${appCreds.installationId})`
    : LEGACY_PAT
      ? "legacy PAT (DEPRECATED — migrate to GitHub App for SOC 2)"
      : "NO GitHub auth (clone/push will only work for public repos)";
  // eslint-disable-next-line no-console
  console.log(`[bugs-managed-claude-agent] listening on :${PORT} — auth: ${authMode}`);
});
