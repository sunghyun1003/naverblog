import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../server/http/app.js";
import { SessionAuthService } from "../server/services/session-auth.js";

function authService() {
  return new SessionAuthService({
    username: "carrot",
    password: "carrot",
    sessionSecret: "test-session-secret-that-is-long-enough",
    secureCookie: false,
  });
}

test("carrot 계정으로 로그인하고 HttpOnly 세션으로 API에 접근한다", async (context) => {
  const app = buildApp({ auth: authService() });
  context.after(() => app.close());

  const blocked = await app.inject({ method: "GET", url: "/api/contents" });
  assert.equal(blocked.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-requested-with": "dashboard" },
    payload: { username: "carrot", password: "carrot" },
  });
  assert.equal(login.statusCode, 200);
  const cookie = login.headers["set-cookie"];
  assert.match(cookie ?? "", /^__session=/);
  assert.match(cookie ?? "", /HttpOnly/);
  assert.match(cookie ?? "", /SameSite=Strict/);

  const session = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } });
  assert.equal(session.statusCode, 200);
  assert.equal(session.json<{ user: { id: string } }>().user.id, "carrot");
});

test("잘못된 비밀번호와 요청 출처 없는 변경 요청을 거부한다", async (context) => {
  const app = buildApp({ auth: authService() });
  context.after(() => app.close());
  const invalid = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-requested-with": "dashboard" },
    payload: { username: "carrot", password: "wrong" },
  });
  assert.equal(invalid.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-requested-with": "dashboard" },
    payload: { username: "carrot", password: "carrot" },
  });
  const rejected = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: login.headers["set-cookie"] } });
  assert.equal(rejected.statusCode, 403);
});

test("복사용 공개 이미지 주소는 서명과 만료 시각을 검증한다", () => {
  const auth = authService();
  const now = Date.UTC(2026, 7, 30, 0, 0, 0);
  const expiresAt = now + 15 * 60 * 1000;
  const signature = auth.signPublicResource("123:hero", expiresAt);
  assert.equal(auth.verifyPublicResource("123:hero", expiresAt, signature, now), true);
  assert.equal(auth.verifyPublicResource("123:visual-01", expiresAt, signature, now), false);
  assert.equal(auth.verifyPublicResource("123:hero", expiresAt, signature, expiresAt + 1), false);
});
