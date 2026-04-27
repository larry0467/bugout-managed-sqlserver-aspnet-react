import "dotenv/config";
import { readFileSync } from "node:fs";
import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { RunRequestSchema, type RunResponse } from "./types.js";
import { runOnce } from "./runner.js";

const PORT = Number(process.env.PORT ?? 7100);
const SIDECAR_KEY = process.env.CLAUDE_AGENT_SIDECAR_API_KEY ?? "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

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

  try {
    const result = await runOnce({
      request: parse.data,
      anthropicApiKey: ANTHROPIC_KEY,
      githubToken: GITHUB_TOKEN || null,
    });
    res.status(200).json(result);
  } catch (err) {
    // Anything reaching here is genuinely catastrophic — return 500 per the spec.
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Sidecar internal error: ${message}` });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[bugs-managed-claude-agent] listening on :${PORT}`);
});
