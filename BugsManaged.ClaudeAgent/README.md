# BugsManaged.ClaudeAgent

Node.js sidecar service that runs the Claude Agent SDK against a local code repository
to analyze a Bugs Managed bug report and (when possible) open a GitHub PR with a
proposed fix. The C# `BugsManaged.Api` backend calls this sidecar over HTTP.

> **Safety, in one line:** this sidecar will only ever push to a configured `devBranch`
> and only ever open PRs whose `base` is that `devBranch`. It refuses
> `main`/`master`/`demo`/`beta`/`prod` everywhere — in the agent's system prompt, in
> the `canUseTool` permission gate, and in the git/GitHub helper code.

---

## Run locally

```bash
cd BugsManaged.ClaudeAgent
cp .env.example .env             # then fill in secrets
npm install
npm run build
npm start                        # listens on :7100
```

Health check:

```bash
curl http://localhost:7100/healthz
# -> {"ok":true,"version":"0.1.0"}
```

Smoke test (skips gracefully if `ANTHROPIC_API_KEY` is unset):

```bash
npm run build && npm run smoke
```

The smoke test posts a tiny ticket pointing at this very repo, asks Claude to
"check whether README.md mentions the project name," and asserts that we get
back a coherent analysis. It uses a fake `devBranch` so no PR is ever opened.

---

## Environment variables

| Var                              | Required | Purpose                                                                 |
| -------------------------------- | -------- | ----------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`              | yes      | Used by the Claude Agent SDK.                                           |
| `CLAUDE_AGENT_SIDECAR_API_KEY`   | yes      | Shared secret. Every `POST /run` must send `X-Claude-Agent-Key`.        |
| `GITHUB_TOKEN`                   | no       | If unset, the sidecar runs in analysis-only mode (never opens PRs).     |
| `PORT`                           | no       | HTTP port. Defaults to `7100`.                                          |

---

## HTTP contract

### `GET /healthz`

```json
{ "ok": true, "version": "0.1.0" }
```

### `POST /run`

Headers: `X-Claude-Agent-Key: <secret>`, `Content-Type: application/json`.

Request body (zod-validated):

```json
{
  "runId": 123,
  "model": "claude-sonnet-4-6",
  "hardCostCapUsd": 20.0,
  "ticket": {
    "id": 1234,
    "title": "Login button does nothing on Safari",
    "description": "...",
    "transcript": "<reporter video transcript>",
    "consoleErrors": "...",
    "currentPageUrl": "https://app.example.com/login",
    "ticketType": "BUG"
  },
  "repo": {
    "path": "/path/to/local/checkout",
    "subpath": "",
    "devBranch": "dev",
    "githubOwner": "your-org",
    "githubRepo": "your-repo"
  }
}
```

Response (always `200 OK`, except for true server errors which return `500`):

```json
{
  "status": "SUCCEEDED" | "FAILED" | "CAPPED",
  "analysisMarkdown": "## Diagnosis\n\n...",
  "prUrl": "https://github.com/your-org/your-repo/pull/45",
  "branchName": "claude/bug-1234-123456",
  "tokensIn": 12345,
  "tokensOut": 6789,
  "costUsd": 4.23,
  "durationMs": 187341,
  "errorMessage": null
}
```

Failure semantics:

- Bad input shape → `400` with `{"error": "..."}`.
- Missing/wrong `X-Claude-Agent-Key` → `401`.
- Repo path missing → `200`, `status: "FAILED"`, `errorMessage: "RepoPath not found: ..."`.
- Dev branch missing on remote → `200`, `status: "SUCCEEDED"`, `prUrl: null`, with a footer note in `analysisMarkdown` explaining why no PR was opened.
- `costUsd > hardCostCapUsd` mid-run → `200`, `status: "CAPPED"`, partial analysis returned, all worktree edits discarded.
- Anthropic error / agent crash → `200`, `status: "FAILED"`, `errorMessage` populated.

---

## Safety constraints (defense in depth)

1. **`devBranch` allow-list.** `src/git.ts:assertWritableBranch` rejects any branch in
   `{main, master, demo, beta, prod, production, release}`. Both the branch the agent
   commits *to* (the temp `claude/bug-N` branch) and the dev branch we push *from* are
   checked. `src/github.ts:openPullRequest` does the same check on PR `base` and `head`
   before calling the GitHub API.
2. **System-prompt rule.** The agent is told the same restriction in plain English so
   any tool calls it tries to make also fail predictably.
3. **`canUseTool` gate.** The agent's `Bash` tool is filtered: any command containing
   `git push|commit|checkout|branch|merge|rebase|reset|tag` or
   `curl|wget|ssh|scp` is denied. The orchestrator owns all git mutations.
4. **Path scoping.** `Edit` and `Write` calls are denied if the resolved target path
   isn't under `repo.path`. `repo.subpath` is rejected if it traverses out of `repo.path`.
5. **Cost cap.** `src/cost.ts:CostTracker` accumulates input/output tokens after every
   assistant turn and aborts the agent loop the moment cumulative cost crosses
   `hardCostCapUsd`. The SDK's own `maxBudgetUsd` is also passed as a backstop.
6. **No session leakage.** `persistSession: false` and `settingSources: []` keep this
   sidecar from reading `~/.claude/...` or writing JSONL transcripts to disk.

---

## Code layout

```
BugsManaged.ClaudeAgent/
├── src/
│   ├── server.ts        Express app, auth, route handlers
│   ├── runner.ts        Orchestrates one /run end-to-end
│   ├── agent.ts         Claude Agent SDK loop + cost/permission hooks
│   ├── cost.ts          Per-model rate table + token accumulator
│   ├── git.ts           simple-git wrappers + branch safety asserts
│   ├── github.ts        Octokit PR creation + base/head safety asserts
│   └── types.ts         Zod schemas + RunResponse shape
├── scripts/
│   └── smoke.ts         End-to-end smoke test
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example
└── README.md (this file)
```

---

## Docker

```bash
docker build -t bugs-managed-claude-agent:dev .
docker run --rm -p 7100:7100 \
  -e ANTHROPIC_API_KEY=... \
  -e CLAUDE_AGENT_SIDECAR_API_KEY=... \
  -e GITHUB_TOKEN=... \
  -v /path/to/checkout:/repo \
  bugs-managed-claude-agent:dev
```

The repo path you POST in `/run` must be visible inside the container — typically you'll
mount the checkout at a known path and tell the C# backend to send that same path.
