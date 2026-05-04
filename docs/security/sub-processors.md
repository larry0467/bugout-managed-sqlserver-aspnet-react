# Bug Out Managed — Sub-processor Disclosure

**Last updated:** 2026-04-28
**Owner:** security@your-domain.com

This document lists every third-party service that processes Bug Out Managed
customer data, the data they receive, and the contractual basis for that
processing. Required disclosure for SOC 2 audits and most enterprise customer
DPAs (Data Processing Addenda).

When onboarding a new customer, share this list as part of the security
package. When **adding** a new sub-processor, update this file and notify
existing customers per the notice period in their DPA (typically 30 days).

---

## Sub-processors

### Microsoft Azure (compute, storage, identity)
- **Service:** Azure Container Apps, Azure SQL Database, Azure Key Vault, Azure
  Static Web Apps, Azure Blob Storage, Microsoft Entra ID (Azure AD), Application
  Insights / Log Analytics.
- **Region:** `eastus2` (single region; cross-region replication for prod
  database backups).
- **Data processed:** Tenant tickets (text + structured metadata), uploaded
  videos, console / network error captures, voice transcripts, user accounts
  (email, BCrypt password hash, role), audit logs.
- **Data retention:** Operational data — for the life of the tenant subscription
  + 30 days. Backups — 30 days rolling. Audit logs — 1 year minimum (SOC 2 CC7.2).
- **Encryption:** At rest — Azure platform-default (AES-256, FIPS 140-2 Level 1).
  In transit — TLS 1.2+ on all external endpoints, mutual TLS for managed
  identity → KV calls.
- **Sub-processor's compliance posture:** SOC 1 / 2 / 3, ISO 27001/17/18,
  FedRAMP High, HIPAA-eligible. Reports available on the Microsoft Service Trust
  Portal.
- **Contract basis:** Microsoft Online Services DPA + Microsoft Customer
  Agreement.

### Anthropic, PBC (large language model)
- **Service:** Claude API (`claude-sonnet-4-6`, `claude-opus-4-7`,
  `claude-haiku-4-5` for ticket classification).
- **Data processed:** Ticket title, description, transcript, console errors,
  current page URL. **No** customer source code is sent — Claude operates
  on a freshly-cloned repo inside the sidecar's local container filesystem and
  only the diff and Diagnosis markdown are returned.
- **Data retention:** Anthropic does not retain prompts or completions for model
  training when called via the API key plan. Per-request server logs are kept
  for ≤30 days for safety/abuse review.
- **Encryption in transit:** TLS 1.2+.
- **Sub-processor's compliance posture:** SOC 2 Type II.
- **Contract basis:** Anthropic Commercial Terms of Service + DPA (when on a
  commercial plan).

### GitHub, Inc. (source control + PR delivery)
- **Service:** GitHub REST API (PR create/read), Git over HTTPS (clone, push).
- **Data processed:** Source files for the customer-designated repository (read
  for cloning, write only for the agent's branch — never to protected branches),
  PR metadata (title, body, branch names).
- **Authentication:** GitHub App (`Bug Out Managed Bot`) with per-installation
  short-lived (1-hour) tokens. **No long-lived PAT.** Per-repo scoped install.
- **Data retention:** Indefinite at GitHub (PRs, branches, commit history).
  Customer controls deletion via standard Git/GitHub controls.
- **Sub-processor's compliance posture:** SOC 1 / 2, ISO 27001.
- **Contract basis:** GitHub Customer Agreement.

### ElevenLabs (optional, only when video transcription is enabled)
- **Service:** Speech-to-text on widget-uploaded videos.
- **Data processed:** Audio track of recorded bug reports.
- **Status:** Reserved — enabled per-tenant only with explicit DPA amendment.
- **Sub-processor's compliance posture:** SOC 2 Type II.

---

## Data flow summary

```
[ Customer browser ]                                 [ Bug Out admin staff ]
        │                                                       │
        │ 1. POST /api/tickets (X-BOM-API-Key,                  │ 4. Login + triage
        │    title/transcript/console errors,                   │    via JWT
        │    optional video blob)                               │
        ▼                                                       ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                  api.your-domain.com                          │
   │                  Azure Container App (eastus2)                │
   │  ┌─────────────────────┐         ┌──────────────────────┐    │
   │  │  ASP.NET Core API   │ ──────▶ │  Claude Agent sidecar │    │
   │  │  (auth, tickets,    │ HTTP    │  (Node.js, /run)      │    │
   │  │   audit, rate-limit)│ :7100   │                       │    │
   │  └────────┬────────────┘         └──────────┬────────────┘    │
   │           │                                  │                 │
   │           │ EF Core                          │ HTTPS           │
   │           ▼                                  ▼                 │
   │     Azure SQL DB                     api.anthropic.com         │
   │     (bugout)                         api.github.com            │
   │                                                                 │
   │     KV (kv-bugout-prod-ti8i)                                   │
   │     ├─ sql-connection-string                                   │
   │     ├─ anthropic-api-key                                       │
   │     ├─ claude-agent-sidecar-api-key                            │
   │     ├─ github-app-id                                           │
   │     ├─ github-app-installation-id                              │
   │     └─ github-app-private-key                                  │
   └────────────────────────────────────────────────────────────────┘
                       │
                       │ stdout → ingestion
                       ▼
              Application Insights / Log Analytics
              (BugsManaged.Audit category = SOC 2 audit stream)
```

---

## How to update

1. PR against this file with the new sub-processor + all six fields (service,
   region, data, retention, encryption, compliance).
2. Notify existing customers per their DPA notice period.
3. Update Vanta/Drata sub-processor inventory.
4. Add to procurement security review queue if the new sub-processor is high-risk.
