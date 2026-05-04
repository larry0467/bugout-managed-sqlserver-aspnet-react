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

### Imperative API

After the script loads you can control the widget programmatically:

```js
window.BugOutManagedWidget.mount({ ...config });  // re-mount with new config
window.BugOutManagedWidget.unmount();             // remove from DOM
```

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

---

## License

MIT
