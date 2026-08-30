import { createHmac, timingSafeEqual } from "node:crypto";

const sessionCookieName = "carrot_dashboard_session";
const sessionLifetimeSeconds = 60 * 60 * 12;
const maxLoginAttempts = 5;
const loginWindowMs = 15 * 60 * 1000;

export interface SessionAuthConfig {
  username: string;
  password: string;
  sessionSecret: string;
  secureCookie: boolean;
}

export interface DashboardSession {
  username: string;
  expiresAt: number;
}

interface LoginAttempt {
  count: number;
  resetAt: number;
}

function secureEqual(left: string, right: string): boolean {
  const leftDigest = createHmac("sha256", "carrot-login-compare").update(left).digest();
  const rightDigest = createHmac("sha256", "carrot-login-compare").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index < 1) return [];
      return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
    }),
  );
}

export class SessionAuthService {
  private readonly attempts = new Map<string, LoginAttempt>();

  constructor(private readonly config: SessionAuthConfig) {}

  login(username: string, password: string, clientKey: string, now = Date.now()): DashboardSession | null {
    const attempt = this.attempts.get(clientKey);
    if (attempt && attempt.resetAt > now && attempt.count >= maxLoginAttempts) return null;
    if (attempt && attempt.resetAt <= now) this.attempts.delete(clientKey);

    const valid = secureEqual(username, this.config.username) && secureEqual(password, this.config.password);
    if (!valid) {
      const current = this.attempts.get(clientKey);
      this.attempts.set(clientKey, {
        count: (current?.count ?? 0) + 1,
        resetAt: current?.resetAt && current.resetAt > now ? current.resetAt : now + loginWindowMs,
      });
      return null;
    }

    this.attempts.delete(clientKey);
    return { username: this.config.username, expiresAt: now + sessionLifetimeSeconds * 1000 };
  }

  createToken(session: DashboardSession): string {
    const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
    return `${payload}.${this.sign(payload)}`;
  }

  verifyCookie(cookieHeader: string | undefined, now = Date.now()): DashboardSession | null {
    const token = parseCookies(cookieHeader)[sessionCookieName];
    if (!token) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = this.sign(payload);
    if (!secureEqual(signature, expected)) return null;
    try {
      const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DashboardSession;
      if (session.username !== this.config.username || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) return null;
      return session;
    } catch {
      return null;
    }
  }

  sessionCookie(session: DashboardSession): string {
    const secure = this.config.secureCookie ? "; Secure" : "";
    return `${sessionCookieName}=${encodeURIComponent(this.createToken(session))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}${secure}`;
  }

  clearCookie(): string {
    const secure = this.config.secureCookie ? "; Secure" : "";
    return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  }

  signPublicResource(resource: string, expiresAt: number): string {
    return this.sign(`resource:${resource}:${expiresAt}`);
  }

  verifyPublicResource(resource: string, expiresAt: number, signature: string, now = Date.now()): boolean {
    if (!Number.isInteger(expiresAt) || expiresAt <= now || expiresAt > now + 60 * 60 * 1000) return false;
    return secureEqual(signature, this.signPublicResource(resource, expiresAt));
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.config.sessionSecret).update(payload).digest("base64url");
  }
}
