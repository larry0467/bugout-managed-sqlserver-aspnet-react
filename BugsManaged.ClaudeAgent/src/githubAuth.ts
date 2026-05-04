import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// GitHub App authentication.
//
// Why GitHub App instead of a Personal Access Token?
//   * No long-lived secret in the running process. The App's private key
//     stays in Azure Key Vault; the sidecar exchanges a short-lived JWT
//     (10-min lifetime) for a 1-hour installation token at each call.
//   * Per-repo install scope (least privilege).
//   * Token rotation is automatic — no human in the loop.
//   * Bot identity in PRs (audit trail).
//   * Required posture for SOC 2 / enterprise customer security review.
//
// Auth flow:
//   1. Sign an RS256 JWT with the App's private key. Payload identifies the
//      App and is valid for 10 minutes.
//   2. POST that JWT (as a Bearer token) to
//      `/app/installations/{installation_id}/access_tokens`.
//   3. GitHub returns `{ token: "ghs_...", expires_at: "..." }`. Use that
//      token for git push (HTTPS basic with x-access-token user) and for
//      every Octokit call.
//   4. Cache the installation token in memory; refresh ~5 minutes before
//      its declared expiry.
//
// All cryptography uses Node's built-in `crypto` — no extra dependency.
// ---------------------------------------------------------------------------

interface InstallationTokenCacheEntry {
  token: string;
  expiresAt: number; // ms since epoch
}

let cachedToken: InstallationTokenCacheEntry | null = null;

// Refresh threshold: re-mint the installation token when there's <5 min left
// on it. Keeps long-running Claude operations from getting bitten by a
// mid-flight expiry.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface GitHubAppCredentials {
  appId: string;
  installationId: string;
  /** PEM-encoded RSA private key, with the BEGIN/END headers intact. */
  privateKeyPem: string;
}

/**
 * Read the App credentials from env. Returns null when any field is empty
 * or still the terraform placeholder — caller falls back to anonymous /
 * unauthenticated git in that case.
 */
export function readGitHubAppCredentials(): GitHubAppCredentials | null {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();
  const privateKeyPem = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !installationId || !privateKeyPem) return null;
  if (
    appId.startsWith("placeholder") ||
    installationId.startsWith("placeholder") ||
    privateKeyPem.startsWith("placeholder")
  ) {
    return null;
  }
  // The private key arrives via env var; KV stores it with literal newlines.
  // If the runtime stripped them (some env injection paths replace \n with
  // an actual escape sequence), rehydrate.
  const normalized = privateKeyPem.includes("\\n")
    ? privateKeyPem.replace(/\\n/g, "\n")
    : privateKeyPem;
  return { appId, installationId, privateKeyPem: normalized };
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Mint an App-level JWT (10-minute lifetime, signed RS256). This is NOT
 * the token we use for git ops — it's the credential we present to GitHub
 * to mint an installation token.
 *
 * GitHub spec: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
 */
function signAppJwt(creds: GitHubAppCredentials): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    // GitHub recommends `iat` slightly in the past to absorb clock skew.
    iat: nowSec - 60,
    exp: nowSec + 9 * 60, // max is 10 minutes; 9 leaves margin
    iss: creds.appId,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), {
    key: creds.privateKeyPem,
  });

  return `${signingInput}.${base64Url(signature)}`;
}

/**
 * Get a valid installation token. Returns the cached one if it has more
 * than 5 minutes left; otherwise mints a fresh one via GitHub.
 *
 * Returns null if no GitHub App credentials are configured (caller decides
 * how to degrade — typically: skip auth, public-only operations).
 */
export async function getInstallationToken(): Promise<string | null> {
  const creds = readGitHubAppCredentials();
  if (!creds) return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - now > TOKEN_REFRESH_MARGIN_MS) {
    return cachedToken.token;
  }

  const jwt = signAppJwt(creds);
  const url = `https://api.github.com/app/installations/${encodeURIComponent(creds.installationId)}/access_tokens`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bugs-managed-claude-agent",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `GitHub App token exchange failed: HTTP ${res.status} — ${body.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as { token?: string; expires_at?: string };
  if (!data.token || !data.expires_at) {
    throw new Error("GitHub App token exchange returned malformed body");
  }
  cachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };
  return cachedToken.token;
}

/**
 * Force-clear the cached installation token. Call this when an HTTP 401
 * comes back from the API — it covers the rare case where the token was
 * revoked server-side (e.g. App uninstalled mid-run).
 */
export function invalidateInstallationToken(): void {
  cachedToken = null;
}
