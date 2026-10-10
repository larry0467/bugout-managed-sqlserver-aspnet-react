# Bug Out Managed — SQL Server + ASP.NET Core + React

Centralized bug reporting and feature request platform. Embeddable widget for any web app, with a unified dashboard for triaging, assigning, and resolving tickets across all your applications.

## Stack

| Layer | Technology |
|-------|-----------|
| **API** | ASP.NET Core 10, Entity Framework Core, C# |
| **Database** | SQL Server (Azure SQL or local) |
| **Admin Dashboard** | React 18, TypeScript, Ant Design, Recharts |
| **Widget** | Self-contained IIFE bundle (no npm, drop-in `<script>` tag, 52KB gzip) |
| **Auth** | JWT (Bearer tokens), BCrypt password hashing |

> Also available in [PostgreSQL + Spring Boot + React](https://github.com/larry0467/bugout-managed-postgres-spring-react)

## Features

- Multi-project support (one per application)
- Multi-tenant context (tenant ID, name, database, environment)
- Organization & team management with role-based access
- Screen recording + voice transcription
- Console error & network error auto-capture
- Developer category classification (UI, Backend, DevOps, etc.)
- Ticket lifecycle: OPEN → IN_PROGRESS → IN_REVIEW → READY_FOR_TESTING → VERIFIED → RESOLVED → CLOSED
- Threaded notes/chat per ticket, synced with Slack
- Email, Slack, and webhook notifications
- AI-assisted diagnosis and automated PR generation (via Claude Agent sidecar)
- Embeddable widget with dark/light theme

---

## Quick Start (Local)

### Prerequisites
- .NET 10 SDK
- SQL Server (local or Docker)
- Node.js 20+

### 1. Start SQL Server (Docker)
```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=BugOutManaged2026!" \
  -p 1433:1433 --name bugout-sql \
  mcr.microsoft.com/mssql/server:2022-latest
```

### 2. Start the API
```bash
cd BugsManaged.Api
dotnet run
```
API runs on http://localhost:5000. Database auto-creates on first run.

### 3. Start the Admin Dashboard
```bash
cd bugs-managed-admin
npm install
npm run dev
```
Dashboard runs on http://localhost:5173.

### 4. Register & Create a Project
1. Open http://localhost:5173
2. Register with your email
3. Go to Applications → New Project → "My App"
4. Copy the API key

### 5. Add Widget to Your App

No npm install required. Add two tags to your app's `index.html`:

```html
<script>
  window.__BUG_OUT_CONFIG__ = {
    apiKey: "bom_your_api_key_here",
    apiUrl: "http://localhost:5000/api",
    userEmail: currentUser.email,
    userName: currentUser.name,
    // Multi-tenant apps (optional):
    tenantId: tenant.id,
    tenantName: tenant.name,
    databaseName: tenant.dbName,
    appVersion: "1.0.0",
    environment: "PRODUCTION",
  };
</script>
<script src="http://localhost:5000/widget.iife.js" defer></script>
```

The floating orb mounts automatically after the page loads. No framework dependency — works with React, Vue, Angular, or plain HTML.

---

## Deploy with Docker Compose

```bash
cp .env.example .env
# Edit .env with your passwords and domains

docker-compose up -d
```

This starts SQL Server, the API, and the admin dashboard. Dashboard on port 80, API on 8090.

---

## Deploy to Azure

### Option 1: Azure CLI (recommended for first setup)

```bash
# Login to Azure
az login

# Run the setup script (creates all resources)
chmod +x azure-setup.sh
./azure-setup.sh
```

This creates:
- **Azure SQL Database** — managed SQL Server
- **Azure App Service** — hosts the .NET API
- **Azure Static Web App** — hosts the admin dashboard

### Option 2: GitHub Actions (CI/CD)

After running `azure-setup.sh`, set up continuous deployment:

1. Get the API publish profile:
   ```bash
   az webapp deployment list-publishing-profiles \
     --name bugout-managed-api \
     --resource-group bugout-managed-rg --xml
   ```

2. Get the Static Web App token:
   ```bash
   az staticwebapp secrets list \
     --name bugout-managed-admin \
     --resource-group bugout-managed-rg
   ```

3. Add both as GitHub repository secrets:
   - `AZURE_WEBAPP_PUBLISH_PROFILE`
   - `AZURE_STATIC_WEB_APPS_TOKEN`

4. Push to `main` — GitHub Actions deploys automatically.

### Post-Deploy

1. **Register** at your dashboard URL
2. **Create projects** for each app you want to monitor
3. **Add team members** on the Team page
4. **Configure Slack** on the Settings page
5. **Add the widget** to each app's `index.html`:
   ```html
   <script>
     window.__BUG_OUT_CONFIG__ = {
       apiKey: "your-project-api-key",
       apiUrl: "https://api.your-domain.com/api",
       userEmail: currentUser.email,
       userName: currentUser.name,
     };
   </script>
   <script src="https://api.your-domain.com/widget.iife.js" defer></script>
   ```
6. **Update CORS** — add each consumer app's domain to `BugOutManaged__Cors__AllowedOrigins` in the API environment variables

---

## Project Structure

```
├── BugsManaged.Api/          # ASP.NET Core Web API
│   ├── Controllers/          # API endpoints
│   ├── Data/                 # EF Core DbContext
│   ├── Entities/             # Database models
│   ├── Services/             # Business logic
│   ├── Dockerfile
│   └── Program.cs            # App configuration
├── BugsManaged.ClaudeAgent/  # Node.js AI agent sidecar
├── bugs-managed-admin/       # React admin dashboard
├── bugs-managed-widget/      # Embeddable React widget
├── landing/                  # Marketing landing page
├── docker-compose.yml        # Full stack local deploy
├── azure-setup.sh            # One-click Azure resource creation
└── .github/workflows/        # CI/CD pipeline
```

---

## Slack Integration

### Outbound (Dashboard → Slack)
Messages posted in ticket chat are automatically sent to the project's Slack webhook.

### Inbound (Slack → Dashboard)
1. Create a Slack App at api.slack.com/apps
2. Add slash command: `/bugout-chat` → `https://api.your-domain.com/api/slack/command`
3. Usage: `/bugout-chat 42 Looking into this now`

Configure per-project on the Settings page in the dashboard.

---

## AI Agent (Claude Sidecar)

Bug Out Managed ships with an optional Claude-powered agent that can analyze a ticket, diagnose the root cause, and open a GitHub PR with a proposed fix.

See [BugsManaged.ClaudeAgent/README.md](./BugsManaged.ClaudeAgent/README.md) for setup and configuration.

---

## Widget API

The widget file is served by the API at `/widget.iife.js` (no CDN, no npm). It sends a POST to `/api/tickets` with the `X-BOM-API-Key` header. No JWT required — the API key authenticates the widget.

### `window.__BUG_OUT_CONFIG__` options

| Key | Required | Description |
|-----|----------|-------------|
| `apiKey` | ✅ | Project API key from the dashboard |
| `apiUrl` | ✅ | Base URL of the Bug Out API (no trailing slash) |
| `userEmail` | ✅ | Email of the logged-in user |
| `userName` | | Display name of the logged-in user |
| `tenantId` | | Tenant identifier (multi-tenant apps) |
| `tenantName` | | Tenant display name |
| `databaseName` | | Tenant database name |
| `appVersion` | | App version string |
| `environment` | | `"PRODUCTION"`, `"STAGING"`, etc. |
| `theme` | | `"dark"` (default) or `"light"` |
| `position` | | `"bottom-right"` (default), `"bottom-left"` |

### Captured automatically:
- Page URL and title
- Browser user agent
- Screen dimensions
- Console errors (last 50)
- Network errors (failed API calls)
- Screen recording + voice transcript (optional)

### Recording through Videos Managed (per app)

The widget's own recorder (`getDisplayMedia` + `MediaRecorder` inside the host page) stops the
moment the reporter navigates or reloads, which is what people do while showing a bug. Give an
app a **Videos Managed workspace API key** (Settings → *Screen Recorder (Videos Managed)*; mint
the key in Videos Managed → Settings → Developers with the `recordings:write` scope) and its
widget records through Videos Managed instead:

1. **Start Recording** opens a window synchronously, then calls `POST /api/tickets/capture-session`
   (widget key). Bug Out asks Videos Managed for a one-time capture link
   (`POST /api/v1/capture/sessions` with the workspace key) and the window navigates to it.
2. The reporter records in that window (`videos-dev.managedplatform.com/capture/<token>`). It is
   authenticated by the token alone, which Videos Managed confines to that one recording. No
   Videos Managed login: the workspace is the licence.
3. On **Stop** the recorder uploads, posts `videos-managed:capture-complete` (share link,
   recording id) to the opener and closes. The ticket is submitted with `videoUrl` = share link
   and `videosManagedRecordingId`; nothing is uploaded to Bug Out's blob storage.
4. `VideosManagedTranscriptWorker` polls the recording's public JSON every
   `DevelopmentTracker:TranscriptPollMinutes` and copies the captions into `Ticket.Transcript`
   once Videos Managed has transcribed it. The admin UI embeds the share page (`?embed=1`).

Only share links on our Videos Managed host are accepted on `videoUrl`; anything else is dropped.
Apps without a key, a blocked popup, or Videos Managed being unreachable (409 / 502 from
`capture-session`) all fall back to the in-page recorder.

### Imperative API

After the script loads you can control the widget programmatically:

```js
window.BugOutManagedWidget.mount({ ...config });  // re-mount with new config
window.BugOutManagedWidget.unmount();             // remove from DOM
```

---

## Development Tracker

Every piece of ordered development across the Managed Platform apps lives on the **Development** page
(`/development`): the Videos Managed recording that ordered it, what was ordered, the branches and PRs,
the stage, the Claude Code session log, and the what-shipped announcement video.

- An order is a `FEATURE_REQUEST` ticket with `IsDevelopmentOrder = 1`, so it shares the activity feed, notes
  and attachments with the bug board. Any ticket can be promoted with **Track as development** in its detail view.
- Stages: `ORDERED → IN_PROGRESS → LOCAL_DEMO → PR_OPEN → MERGED_DEV → BETA → PRODUCTION → ANNOUNCED`.
  Reaching `PRODUCTION` stamps `ProductionAt`; pasting the announcement video moves the item to `ANNOUNCED`.
  The bug-board `Status` follows the stage when the org's status dictionary has the matching key.
- Deep link: `/development/{id}` (the digest email points there).
- **Daily digest** (`ProductionDigestWorker`): after `DevelopmentTracker:DigestHourLocal` (17:00 Central by default)
  the API emails everything that reached production and has not been in a digest yet, through Comms Managed, to
  `DevelopmentTracker:DigestRecipients` (or every `PLATFORM_OWNER` in the org when empty), asking for the
  what-shipped video. One digest per organization per day; nothing is stamped unless Comms accepted the message.

### Initiatives, phases and "builds on"

Related orders (one effort, several videos) become numbered **phases** of one **initiative** order.

- One level: `Ticket.ParentOrderId` + `PhaseNumber` (kept 1..N by the API). An initiative is never itself a phase.
- Each phase keeps its own video, PRs, stage and test checklist. The initiative's stage **follows its least-advanced
  phase** (`DevelopmentOrderService.RollUpInitiativesAsync`, run after every phase move: board, sessions, webhook,
  fix queue). Moving an initiative by hand is refused (409); deployments skip it; it is never announced or put in
  the digest itself (its phases are).
- **Builds on** (`DependsOnOrderId` + `DependsOnStage`, default `MERGED_DEV`): the order this one is stacked on or
  waits for, and how far that one must get first. The board flags each order (`DevelopmentSequence`):
  *after #N* (waiting), *ready* (base got there), **ahead of #N** (this one moved past PR open before its base
  reached the gate - the out-of-order case). A mobile build waiting on its API uses gate `PRODUCTION`.
- Board: initiatives are expandable rows with a phase strip (one tag per phase, colored by stage, `!` = ahead);
  tick rows and **Group into an initiative**; the drawer has Phases (reorder, take out, add) or
  "Initiative and sequence" (part of / builds on / previous-next phase).

### Test checklist

Every order has a checklist for whoever tests it when it is ready (local demo, dev, beta): `TicketTestItems`
(`Text`, `Expected`, `Environment` ANY / LOCAL / DEV / BETA, latest `Result` PASS / FAIL with `ResultNote`,
`TestedIn`, `TestedBy`). The session that built the order writes it; any signed-in user (viewers included) records
results; **New round** clears results (old ones stay in Activity). The board shows "3/7 tested · 1 failed"; an
initiative counts and lists every phase's checklist. "Copy" gives a text version for chat or a PR.

### Service keys (machine access)

Claude Code sessions write to the tracker with a **service key** (Settings → Service Keys; `PLATFORM_OWNER` /
`SUPER_ADMIN`). The raw key is shown once; only its SHA-256 is stored. Send it as `X-BOM-Service-Key`. It is
accepted **only** on `/api/development/*` (enforced in `ServiceKeyAuthenticationHandler`), carries role `SERVICE`
and the scopes `development:read` / `development:write`. On the devbox it lives in
`%USERPROFILE%\.bugout\service-key.json` as `{ "key": "bsk_...", "apiBase": "https://bugout-api.managedplatform.com" }`.

### API (`/api/development`, user JWT or service key)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `stages` | stage keys and labels |
| GET / POST | `projects` | list apps / ensure an app exists (`{ name, slug? }`) |
| GET | `orders?projectSlug=&stage=A,B&needsAnnouncement=&search=&includeAnnounced=&includePhases=` | the board (`includePhases=true`: a listed initiative brings every phase) |
| GET | `orders/{id}` | detail: links, stage history, activity, transcript, test checklist (an initiative: every phase's) |
| POST | `orders` | create: `projectSlug` or `projectId`, `title`, `summary`, `videoUrl`, `transcript`, `sessionLogUrl`, `sessionId`, `orderedBy`, `stage`, `priority`, `links[]`, `parentOrderId`, `phaseNumber`, `dependsOnOrderId`, `dependsOnStage`, `tests[]` |
| POST | `initiatives` | `{ orderIds[], title \| initiativeId, summary, chain }`: group orders as phases (new or existing initiative) |
| PUT | `orders/{id}/placement` | `{ parentOrderId, phaseNumber, dependsOnOrderId, dependsOnStage }` (full replacement; null = standalone / nothing) |
| GET / POST | `orders/{id}/tests` | checklist / add `{ items: [{ text, expected, environment }], replace }` |
| PUT / DELETE | `orders/{id}/tests/{itemId}` | edit `{ text, expected, environment, position }` / remove |
| PUT | `orders/{id}/tests/{itemId}/result` | `{ result: PASS \| FAIL \| "", note, testedIn }` (any signed-in user) |
| POST | `orders/{id}/tests/new-round` | clear every result |
| POST | `orders/from-ticket/{ticketId}` | promote an existing ticket |
| PATCH | `orders/{id}` | `title`, `summary`, `videoUrl`, `transcript`, `sessionLogUrl`, `sessionId`, `announcementVideoUrl`, `priority`, `orderedBy` (`""` clears) |
| PUT | `orders/{id}/stage` | `{ stage, note }` |
| POST / DELETE | `orders/{id}/links[/{linkId}]` | `{ kind: BRANCH \| PR \| COMMIT \| DOC \| VIDEO, repo, name, url, note }` |
| GET | `shipped?date=yyyy-MM-dd` | what reached production that day (tracker time zone) |

Writes need `PLATFORM_OWNER` / `SUPER_ADMIN` / `DEVELOPER` or a key with `development:write`; `VIEWER` and
read-only keys can only read. Everything is organization-scoped like tickets.

### Azure DevOps webhook (the team's own work, hands-free stages)

`POST /api/development/webhooks/azure-devops` accepts Azure DevOps service-hook payloads, authenticated with a
service key in the `X-BOM-Service-Key` header (create a dedicated key for it). Subscribe, per repository, to
*Pull request created*, *Pull request updated* and *Release deployment completed* (or *Run stage state changed*).

| Event | Effect |
|-------|--------|
| PR created | matched to an order by PR link, branch link or a `/development/{id}` url in the PR description; otherwise a new order is created in the app the repo maps to (`DevelopmentTracker:RepoProjects`, or any order that already links that repo). Adds PR + branch links, stage `PR_OPEN`. |
| PR completed | target branch -> stage via `DevelopmentTracker:BranchStages` (`dev` -> `MERGED_DEV`, `beta` -> `BETA`, `master`/`main`/`prod` -> `PRODUCTION`); unmapped branches only get a note. |
| PR abandoned | activity note, stage unchanged. |
| Deployment succeeded | environment / stage name keyword -> stage via `DeployEnvironments` (`beta`, `demo`, `staging`, `qa` -> `BETA`; `prod`, `production`, `live` -> `PRODUCTION`); every order of that app waiting at the previous stage moves. App resolved from the artifact repository, else `PipelineProjects` keywords in the pipeline / release name. |

Deliveries are idempotent (Azure DevOps retries); events that are not acted on return `202` with the reason so the
subscription never shows as failing. Defaults map `ServiceManagerUI` / `ServiceManagedWeb` to `service-managed`.

### Drafted fixes (Claude Code on the devbox, not the API sidecar)

**A person watches the video first.** On every ticket the "After watching the video" card offers four decisions
(`POST /api/development/fixes/{id}/triage { decision, note, guidanceVideoUrl }`): **Develop with Claude** (queues it,
optionally with a re-recorded "how it should work" Videos Managed link whose captions are stored as
`GuidanceTranscript` and fed to the drafting run), **Needs a better video** (parks it), **User error — retrain**
(resolves it; the reporter gets the note) and **Not doing this** (closes it with the reason). Who decided and when is
kept on the ticket. Settings → **Auto-draft Fixes** can skip that gate per application (every incoming `BUG` gets
`FixStatus = REQUESTED`); it is off by default and meant to stay off. The devbox dispatcher
(`scripts\fix-dispatcher\BugOutFixDispatcher.ps1`, scheduled every 10 minutes by `Register-FixDispatcherTask.ps1`,
config `%USERPROFILE%\.bugout\fix-dispatcher.json`) polls `GET /api/development/fixes/queue`, claims the oldest ticket,
checks out git worktrees of the app's repos on `BugOut_Fix_{ticketId}` from `origin/dev`, writes `TICKET.md`
(description, voice transcript, console/network errors, page, tenant, screenshots) and runs
`claude -p` headlessly with a whitelisted tool set. Whatever Claude commits is pushed and opened as pull requests
against `dev` through the Azure DevOps REST API; the result is posted with `POST .../fixes/{id}/result`, which
marks the ticket **Fix ready to test**, turns it into a development order at `PR_OPEN` (so it sits on the board and the
webhook moves it on merge / deploy) and adds an internal note with the analysis. A platform owner or super admin then
**approves** or **rejects** on the ticket (reject can re-queue with feedback); the team merges; beta picks it up.
Nothing is ever merged or deployed by the dispatcher. If the devbox is off, requests wait. Caps: one ticket per run,
`maxPerDay`, `maxMinutesPerFix`; worktrees are removed after each run (disk is tight on the devbox).

| Method | Route (`/api/development/fixes`) | Who |
|--------|-----------------------------------|-----|
| GET / PUT | `apps`, `apps/{projectId}` `{ enabled }` | list / flip auto-draft (PUT: human admin) |
| GET | `queue?projectSlug=&status=REQUESTED&take=` | key or user |
| GET | `{ticketId}` | key or user (blob SAS links included) |
| POST | `{ticketId}/request` `{ note }` | writer or key |
| POST | `{ticketId}/claim` `{ worker }` / `{ticketId}/release` | key (dispatcher) |
| POST | `{ticketId}/result` `{ outcome: READY_TO_TEST \| FAILED, summary, testingNotes, links[] }` | key (dispatcher) |
| POST | `{ticketId}/approve` / `{ticketId}/reject` `{ reason, requeue }` | human admin only |

### The whole team, each on their own Claude plan (`scripts\dev-kit`)

Every developer works tickets in **their own** Claude Code session, so drafting runs on their own
Claude plan, not the devbox's.

- **Routing.** "Develop with Claude" has a *Who builds it* pick: the devbox, or a developer
  (`TriageRequest.assignTo` = their email; sets `AssignedTo` / `AssigneeType = HUMAN` /
  `EscalationStage = ASSIGNED_HUMAN` and emails them). `GET fixes/queue?assignedTo=<email>` is that
  developer's queue; `assignedTo=none` is everything not handed to a person, which is what the devbox
  dispatcher takes (`"assignedTo": "none"` in its config).
- **Kit.** `scripts\dev-kit\Build-DevKit.ps1 -OutFile ...zip` packages `BugOutDev.psm1`, the dispatcher,
  `Install-BugOutDevKit.ps1` and the `/bugout` Claude Code skill. The installer saves the developer's own
  service key (with `me` = their Bug Out email and `name`), installs the skill to
  `%USERPROFILE%\.claude\skills\bugout`, records their repository paths in `fix-dispatcher.json` and checks
  the key, Claude Code and the Azure DevOps credential. In Claude Code: `/bugout mine`, `/bugout take <id>`
  (claim, `Export-BugOutTicketBrief`, branch `BugOut_Fix_<id>` from `origin/dev` or continue it),
  `/bugout done <id>` (push, `New-BugOutPullRequest`, `Complete-BugOutFix READY_TO_TEST`), `release`, `log`, `stage`.
- **Rework updates the same PR.** A rejected-and-re-queued fix continues on the existing
  `BugOut_Fix_<id>` branch (dispatcher and skill alike), pushes without force, and `New-BugOutPullRequest`
  returns the PR already open for that branch instead of creating another.
- **No duplicate orders.** When a PR names a ticket that is not on the board yet (a `/development/<id>`
  link in its description, or a `BugOut_Fix_<id>` source branch), the webhook promotes that ticket to an
  order at `PR_OPEN` instead of creating a second one. Abandoned PRs never promote.
- Approve / reject stays with Platform Owner and Super Admin. Developers (and their keys) can triage,
  claim, report and move stages; nothing merges or deploys automatically.

### From PowerShell (what a Claude Code session does)

```powershell
Import-Module .\scripts\BugOutDev.psm1
Set-BugOutDevConfig -Key 'bsk_...' -ApiBase 'https://bugout-api.managedplatform.com'      # once
$o = New-BugOutOrderFromVideo -VideoUrl 'https://videos-dev.managedplatform.com/<account>/r/<slug>' `
       -ProjectSlug service-managed -Title 'NTE history button' -Summary 'What the video asked for'
Add-BugOutOrderLink -Id $o.order.id -Kind PR -Repo ServiceManagerUI -Name 'PR 4349' -Url 'https://dev.azure.com/...'
Set-BugOutOrderStage -Id $o.order.id -Stage PR_OPEN -Note 'both PRs open against dev'
Update-BugOutOrder -Id $o.order.id -SessionLogUrl 'https://.../SESSION-2026-10-08.md'
```

`New-BugOutOrderFromVideo` reads the recording through `videos-api-dev.managedplatform.com/public/<account>/r/<slug>`
and stores the captions as the transcript. `$o.order.boardUrl` is the link to put in the PR description.

```powershell
# The next video of an effort that is already an initiative: log it as its next phase, stacked on the last one.
$o = New-BugOutOrderFromVideo -VideoUrl '<share link>' -ProjectSlug service-managed -ParentOrderId 445 -DependsOnOrderId 437
New-BugOutInitiative -Title 'Estimates, change orders + AI quoting' -OrderIds 427, 434, 435, 437   # chained phases
Set-BugOutOrderPlacement -Id 438 -InitiativeId 445 -DependsOnOrderId 434 -DependsOnStage PRODUCTION
# The test checklist (write it when the work reaches local demo / PR open; put it in the PR too).
Add-BugOutTests -Id $o.order.id -Tests @('Open WO 90001 > Estimates', @{ text = 'Click Draft with AI'; expected = 'Shows This price assumes'; environment = 'LOCAL' })
Get-BugOutTestChecklistMarkdown -Id $o.order.id    # markdown for the PR description
```
`scripts\Seed-DevelopmentOrders.ps1` creates one app per Managed Platform product and the first orders; it is idempotent.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ConnectionStrings__DefaultConnection` | SQL Server connection string |
| `BugOutManaged__Jwt__Secret` | JWT signing secret (min 32 chars) |
| `BugOutManaged__Jwt__ExpirationMs` | Token lifetime in ms (default: 86400000) |
| `BugOutManaged__Cors__AllowedOrigins` | Comma-separated list of allowed origins |
| `BugOutManaged__VideoStoragePath` | Path for video blob storage |
| `BugOutManaged__ClaudeAgent__BaseUrl` | URL of the Claude agent sidecar (optional) |
| `BugOutManaged__ClaudeAgent__ApiKey` | Shared secret for the Claude agent sidecar (optional) |
| `DevelopmentTracker__DigestEnabled` | Run the daily what-shipped digest (default `true`) |
| `DevelopmentTracker__DigestHourLocal` | Local hour after which the digest goes out (default `17`) |
| `DevelopmentTracker__TimeZone` | Windows or IANA id for the digest clock (default `Central Standard Time`) |
| `DevelopmentTracker__DigestRecipients` | Comma-separated emails; empty = every PLATFORM_OWNER in the org |
| `DevelopmentTracker__BoardBaseUrl` | Admin URL used for board links in the digest (default prod admin) |

---

## License

MIT
