/**
 * Happy-path smoke test for the sidecar.
 *
 * Boots the server in-process, posts a fake bug ticket pointing at the
 * bugs-managed repo itself, and asserts that:
 *   - /healthz returns 200
 *   - /run returns 200 with status SUCCEEDED|CAPPED|FAILED and a markdown body
 *
 * Skips gracefully (exit 0) if ANTHROPIC_API_KEY is not set in env.
 *
 * Run: `npm run smoke`
 */
import "dotenv/config";
import { setTimeout as sleep } from "node:timers/promises";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, "..");
const repoRoot = path.resolve(projectDir, "..");

if (!process.env.ANTHROPIC_API_KEY) {
  console.log("[smoke] ANTHROPIC_API_KEY not set — skipping.");
  process.exit(0);
}

const SIDECAR_KEY = "smoke-test-key";
const PORT = Number(process.env.SMOKE_PORT ?? 7199);
const TIMEOUT_MS = 5 * 60_000;

async function main(): Promise<void> {
  console.log(`[smoke] starting sidecar on :${PORT}, repo=${repoRoot}`);

  const child: ChildProcess = spawn(
    process.execPath,
    [path.join(projectDir, "dist", "server.js")],
    {
      env: {
        ...process.env,
        PORT: String(PORT),
        CLAUDE_AGENT_SIDECAR_API_KEY: SIDECAR_KEY,
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );

  const cleanup = (): void => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  // Wait for /healthz to come up.
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const r = await fetch(`http://localhost:${PORT}/healthz`);
      if (r.ok) {
        healthy = true;
        break;
      }
    } catch {
      // not ready yet
    }
  }
  if (!healthy) {
    cleanup();
    throw new Error("Sidecar never came up on /healthz");
  }
  console.log("[smoke] healthz OK");

  const body = {
    runId: 999,
    model: "claude-sonnet-4-6",
    hardCostCapUsd: 1.5,
    ticket: {
      id: 999,
      title: "Smoke: README.md should mention the platform name 'Bugs Managed'",
      description:
        "Trivial smoke test ticket — please run a quick analysis of the README.md " +
        "and confirm whether the project name is mentioned. DO NOT modify any " +
        "files unless the README is genuinely missing the project name. " +
        "If everything is fine, write a short Diagnosis explaining that and " +
        "set Confidence to high with no Files touched.",
      transcript: "",
      consoleErrors: "",
      currentPageUrl: "",
      ticketType: "BUG",
    },
    repo: {
      path: repoRoot,
      subpath: "",
      // Use a deliberately non-existent branch so the sidecar never tries
      // to push or open a PR — analysis-only flow.
      devBranch: "smoke-non-existent-branch",
      githubOwner: "your-org",
      githubRepo: "your-repo",
    },
  };

  console.log("[smoke] posting /run (this may take a minute)...");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let json: unknown;
  try {
    const res = await fetch(`http://localhost:${PORT}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Claude-Agent-Key": SIDECAR_KEY,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    json = await res.json();
    console.log("[smoke] /run HTTP", res.status);
  } finally {
    clearTimeout(timer);
  }

  console.log("[smoke] response:", JSON.stringify(json, null, 2).slice(0, 4000));

  cleanup();
  await sleep(200);

  const result = json as {
    status?: string;
    analysisMarkdown?: string;
    prUrl?: string | null;
  };
  if (!["SUCCEEDED", "CAPPED", "FAILED"].includes(result.status ?? "")) {
    throw new Error(`Unexpected status: ${result.status}`);
  }
  if (!result.analysisMarkdown || result.analysisMarkdown.length < 20) {
    throw new Error("analysisMarkdown is empty or too short");
  }
  if (result.prUrl !== null && result.prUrl !== undefined) {
    throw new Error(
      `Smoke test should not have opened a PR (devBranch was non-existent), got ${result.prUrl}`,
    );
  }
  console.log("[smoke] OK — status:", result.status);
}

main().catch((err: unknown) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
