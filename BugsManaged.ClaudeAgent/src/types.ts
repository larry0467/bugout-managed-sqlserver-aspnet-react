import { z } from "zod";

export const TicketSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  description: z.string().default(""),
  transcript: z.string().default(""),
  consoleErrors: z.string().default(""),
  currentPageUrl: z.string().default(""),
  ticketType: z.string().default("BUG"),
});

export const RepoSchema = z.object({
  path: z.string().min(1),
  subpath: z.string().default(""),
  devBranch: z.string().min(1),
  githubOwner: z.string().min(1),
  githubRepo: z.string().min(1),
});

export const RunRequestSchema = z.object({
  runId: z.number().int(),
  model: z.string().min(1),
  hardCostCapUsd: z.number().positive().default(20),
  ticket: TicketSchema,
  repo: RepoSchema,
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type RepoSpec = z.infer<typeof RepoSchema>;

export type RunStatus = "SUCCEEDED" | "FAILED" | "CAPPED";

export interface RunResponse {
  status: RunStatus;
  analysisMarkdown: string;
  prUrl: string | null;
  branchName: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  errorMessage: string | null;
}

// Branches that must NEVER be written to. Defense-in-depth alongside the
// `devBranch` allow-list logic — see git.ts and agent.ts.
export const PROTECTED_BRANCHES: readonly string[] = [
  "main",
  "master",
  "demo",
  "beta",
  "prod",
  "production",
  "release",
];
