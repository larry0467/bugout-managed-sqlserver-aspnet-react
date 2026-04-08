# Bugs Managed — SQL Server + ASP.NET Core + React

Centralized bug reporting and feature request platform. Embeddable widget for any web app, with a unified dashboard for triaging, assigning, and resolving tickets across all your applications.

## Stack

| Layer | Technology |
|-------|-----------|
| **API** | ASP.NET Core 10, Entity Framework Core, C# |
| **Database** | SQL Server (Azure SQL or local) |
| **Admin Dashboard** | React 18, TypeScript, Ant Design, Recharts |
| **Widget** | React component, zero dependencies, <5KB gzipped |
| **Auth** | JWT (Bearer tokens), BCrypt password hashing |

> Also available in [PostgreSQL + Spring Boot + React](https://github.com/larry0467/bugs-managed-postgres-spring-react)

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
- Embeddable widget with dark/light theme

---

## Quick Start (Local)

### Prerequisites
- .NET 10 SDK
- SQL Server (local or Docker)
- Node.js 20+

### 1. Start SQL Server (Docker)
```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=BugsManaged2026!" \
  -p 1433:1433 --name bugs-sql \
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
```tsx
import BugsManagedWidget from './components/BugsManagedWidget';

<BugsManagedWidget
  apiKey="bm_your_api_key_here"
  apiUrl="http://localhost:5000/api"
  userEmail={currentUser.email}
  tenantId={tenant.id}           // optional
  tenantName={tenant.name}       // optional
  databaseName={tenant.dbName}   // optional
  appVersion="1.0.0"             // optional
  environment="PRODUCTION"       // optional
/>
```

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
     --name bugs-managed-api \
     --resource-group bugs-managed-rg --xml
   ```

2. Get the Static Web App token:
   ```bash
   az staticwebapp secrets list \
     --name bugs-managed-admin \
     --resource-group bugs-managed-rg
   ```

3. Add both as GitHub repository secrets:
   - `AZURE_WEBAPP_PUBLISH_PROFILE`
   - `AZURE_STATIC_WEB_APPS_TOKEN`

4. Push to `main` — GitHub Actions deploys automatically.

### Post-Deploy

1. **Register** at your dashboard URL
2. **Create projects** for each app (Financials Managed, HDD Managed, etc.)
3. **Add team members** on the Team page
4. **Configure Slack** on the Settings page
5. **Update widget `apiUrl`** in each app to point to the Azure API URL:
   ```
   https://bugs-managed-api.azurewebsites.net/api
   ```
6. **Update CORS** in Azure App Settings to include all your app domains

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
2. Add slash command: `/bug-chat` → `https://your-api.com/api/slack/command`
3. Usage: `/bug-chat 42 Looking into this now`

Configure per-project on the Settings page in the dashboard.

---

## Widget API

The widget sends a POST to `/api/tickets` with the `X-BM-API-Key` header. No JWT required — the API key authenticates the widget.

### Captured automatically:
- Page URL and title
- Browser user agent
- Screen dimensions
- Console errors (last 50)
- Network errors (failed API calls)
- Screen recording + voice transcript (optional)

### Passed by the host app:
- Tenant ID, name, database (for multi-tenant apps)
- App version, environment
- User email/name
