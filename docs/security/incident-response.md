# Bug Out Managed — Incident Response Runbook

**Last updated:** 2026-04-28
**Owner:** security@your-domain.com

A short, actionable playbook for the security incidents most likely to hit
this stack. Required artifact for SOC 2 (CC7.3, CC7.4) and most enterprise
customer security reviews.

---

## Severity definitions

| Sev | Trigger | Response time | Customer comms |
|-----|---------|---------------|----------------|
| **SEV-1** | Confirmed data exfiltration, customer data exposed to wrong tenant, code-execution-as-Bot in a customer repo | <15 min ack, status page within 30 min | Immediate phone + email to all affected customers |
| **SEV-2** | Suspected unauthorized access, credential leaked, sustained service outage > 30 min | <30 min ack, status page within 1 hr | Email within 4 hrs |
| **SEV-3** | Single-tenant degradation, anomalous activity that isn't yet a confirmed breach, expired cert | <2 hrs ack | Affected customer on next business day |

---

## Playbooks

### 1. GitHub App private key leaked (e.g. accidentally pushed to a public repo, screenshot in Slack)

**Severity:** SEV-1.

**Actions in order:**
1. **Revoke the leaked key** in github.com → Settings → Developer settings →
   GitHub Apps → Bug Out Managed Bot → Private keys → "Delete" the leaked key.
2. **Generate a fresh key**, download `.pem`.
3. **Rotate the KV secret:**
   ```bash
   az keyvault secret set \
     --vault-name <your-key-vault-name> \
     --name github-app-private-key \
     --file ./new-key.pem
   ```
4. **Restart the Container App** to pick up the new key (the sidecar caches
   the installation token in memory):
   ```bash
   REV=$(az containerapp show -n <your-container-app> -g <your-resource-group> \
     --query properties.latestRevisionName -o tsv)
   az containerapp revision restart -n <your-container-app> -g <your-resource-group> --revision "$REV"
   ```
5. **Audit GitHub installation activity** for the period the leaked key was
   live: `gh api /app/installations/{id}/repos/{owner}/{repo}/events`. Look
   for unfamiliar branch creations, force-pushes, anything not authored by
   the App itself.
6. **Notify affected customers** if any unauthorized push is found (every
   customer whose repo the App was installed on).
7. **Post-mortem within 5 business days.**

### 2. Sidecar API key (`CLAUDE_AGENT_SIDECAR_API_KEY`) leaked

**Severity:** SEV-2 (the key only gates sidecar HTTP from the API; an
attacker would also need to be inside the Container App's network namespace
to use it — which means they're already deep in the system).

**Actions:**
1. Force a new random sidecar key by re-running terraform apply (the
   `random_password` resource regenerates if you change the App ID variable
   or pass `-replace=module.app.random_password.sidecar_api_key`).
2. Restart the Container App revision (loads the new key into both
   containers).
3. Investigate how it leaked — if from KV access, audit Azure RBAC
   assignments on your Key Vault.

### 3. Anthropic API key leaked

**Severity:** SEV-2 (financial risk: an attacker could rack up bills).

**Actions:**
1. Revoke the leaked key in console.anthropic.com.
2. Mint a new key.
3. `az keyvault secret set --vault-name <your-key-vault-name> --name anthropic-api-key --value <new>`
4. Restart Container App.
5. Review Anthropic billing console for the leak window — file a fraud claim
   if material spend.

### 4. Tenant cross-contamination (customer A sees customer B's tickets)

**Severity:** SEV-1.

**Actions:**
1. **Take the affected endpoint(s) offline immediately.** Easiest:
   `az containerapp ingress disable -n <your-container-app> -g <your-resource-group>`.
2. Collect logs: query Log Analytics for every recent request involving
   either tenant's `OrganizationId`.
3. Identify the bug (likely in `OrgResolutionMiddleware` or a query that
   missed the global filter). Fix + write a test that replays the failure.
4. Determine scope: which customer accounts viewed which other customer's
   data, for how long.
5. **GDPR notification clock starts** — 72 hrs to notify EU regulators if
   any EU customer is affected.
6. Notify all affected customers via phone within 4 hrs.

### 5. Claude opens a malicious-looking PR

**Severity:** SEV-2 (PRs require human approval before merge — the damage
window is "until a customer reviewer approves it").

**Symptoms:** PR diff contains `eval()`, removes a security check, exfiltrates
secrets via `console.log(process.env.X)`, references attacker domains.

**Actions:**
1. Close the PR immediately.
2. Identify the source ticket — pull `consoleErrors`, `transcript`,
   `description` from the DB.
3. Confirm whether the ticket content carried a prompt-injection payload.
   The system prompt in `BugsManaged.ClaudeAgent/src/agent.ts` should have
   refused — investigate why it didn't.
4. Add a regression test (replay the ticket, expect Diagnosis to flag the
   injection attempt).
5. Block the source tenant from further Claude runs until reviewed.

### 6. KV access by an unfamiliar identity

**Severity:** SEV-2.

**Actions:**
1. Pull `KeyVaultData` events from Log Analytics — every secret access is
   logged.
2. Identify the principal — if it's not the app's UAMI or a known
   administrator az login session, treat as unauthorized.
3. Rotate every secret in the vault (full rotation playbook, ~30 min).
4. Audit the principal's other access in Azure (other RGs, other
   subscriptions).

---

## Communication channels (during an incident)

- **War room:** Slack `#bugout-incident-response` (create on-demand).
- **Status page:** `https://status.your-domain.com` (set up via
  Vanta/Drata or a dedicated tool).
- **Customer notification template:** see `docs/security/customer-incident-template.md` (TODO).

---

## Quarterly drill

A SEV-1 tabletop exercise must be run quarterly, with at least these scenarios
rotated through:

1. GitHub App key leak (#1 above).
2. Tenant cross-contamination (#4 above).
3. Sidecar compromise leading to repo writes outside the agent branch.

Drill results recorded in `docs/security/drills/` — required SOC 2 evidence.
