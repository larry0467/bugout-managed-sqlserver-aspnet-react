# Bug Out Managed — Rate Limit Policy

**Last updated:** 2026-04-28

Documented to satisfy SOC 2 CC6.6 (boundary protection). Implementation in
`BugsManaged.Api/Program.cs` (the `AddRateLimiter` block) and applied via
`[EnableRateLimiting("...")]` attributes on hot endpoints.

| Policy | Endpoints | Partition | Window | Limit | Rejection behavior |
|--------|-----------|-----------|--------|-------|--------------------|
| `widget-submit` | `POST /api/tickets` | `X-BOM-API-Key` (per project) | 60s sliding (6 segments) | 30 requests | HTTP 429, `Retry-After: 60` |
| `anon-tight` | `POST /api/auth/login` | Remote IP | 60s fixed | 10 requests | HTTP 429, `Retry-After: 60` |

## Rationale

**`widget-submit`** — the widget's API key is bundled in client JavaScript.
Anyone with browser DevTools can read it. The key authenticates *which Project
owns the ticket*, not *who is allowed to submit*. Rate-limiting per key prevents
a single compromised tenant from drowning the system without affecting other
tenants. 30 / 60s sustains ≈1800 tickets/hour per project — generous for normal
use, instantly visible at abuse rates.

**`anon-tight`** — login is the highest-value endpoint for credential stuffing
and brute force. 10 / 60s slows attackers to ~14 attempts/minute even from a
single IP, makes credential-stuffing economically infeasible. Real users hit
this limit only if they fat-finger the password 10 times in a minute.

## What the limits don't cover (yet)

- **Per-IP cap on `widget-submit`** — currently only per-API-key. A leaked key
  shared across thousands of IPs would still get rate-limited as one bucket
  (which is what we want), but a botnet rotating IPs against many keys is not
  bounded. Add a layered per-IP limit if abuse is observed.
- **Token endpoint (`/api/tickets/{id}/video`)** — file uploads. No limit yet;
  Container App max body size (200 MB) is the only ceiling. Add a per-IP /
  per-key bucket if abuse is observed.
- **Read endpoints** — no limits on GET; reads are cheap and per-org-filtered.

## Tuning

Limits are deliberately conservative for first-customer rollout. Re-evaluate
after observing 30 days of real traffic. Tightening is easier than loosening
once customers have built against the current limits.
