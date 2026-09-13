import { createPublicKey, verify } from "node:crypto";

const issuer = "https://token.actions.githubusercontent.com";
type SigningKey = { kty: string; n: string; e: string; kid: string; alg?: string; use?: string };

/** No client-supplied issuer/JWKS URL. Only the dedicated main-branch sync job is trusted. */
export class GitHubSyncIdentity {
  private keys: { values: SigningKey[]; until: number } | null = null;
  constructor(private readonly audience: string, private readonly repository: string,
    private readonly request: typeof fetch = fetch) {}

  async verifyAuthorization(header: string | undefined): Promise<boolean> {
    try {
      if (!header?.startsWith("Bearer ") || header.length > 16_000) return false;
      const parts = header.slice(7).split(".");
      if (parts.length !== 3) return false;
      const [encodedHeader, encodedClaims, signature] = parts as [string, string, string];
      const meta = JSON.parse(Buffer.from(encodedHeader, "base64url").toString());
      const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString());
      const now = Math.floor(Date.now() / 1000);
      if (meta.alg !== "RS256" || typeof meta.kid !== "string" || claims.iss !== issuer
        || claims.aud !== this.audience || claims.repository !== this.repository
        || claims.ref !== "refs/heads/main"
        || claims.workflow_ref !== `${this.repository}/.github/workflows/sync-dashboard.yml@refs/heads/main`
        || !["workflow_run", "workflow_dispatch", "schedule"].includes(claims.event_name)
        || typeof claims.exp !== "number" || claims.exp <= now
        || typeof claims.iat !== "number" || claims.iat > now + 30 || claims.iat < now - 600
        || typeof claims.nbf !== "number" || claims.nbf > now + 30) return false;
      if (!this.keys || this.keys.until <= Date.now()) {
        const response = await this.request(`${issuer}/.well-known/jwks`, { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) return false;
        const data = await response.json() as { keys: SigningKey[] };
        this.keys = { values: data.keys, until: Date.now() + 300_000 };
      }
      const key = this.keys.values.find((key) => key.kid === meta.kid && key.kty === "RSA" && (!key.alg || key.alg === "RS256"));
      if (!key) { this.keys = null; return false; }
      return verify("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedClaims}`),
        createPublicKey({ key, format: "jwk" }), Buffer.from(signature, "base64url"));
    } catch { return false; }
  }
}
