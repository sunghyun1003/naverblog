import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { buildApp } from "../server/http/app.js";
import { createAutomationSystem } from "../server/system.js";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import { SessionAuthService } from "../server/services/session-auth.js";
import type { GitHubAutomationService } from "../server/services/github-automation.js";

test("large read payloads compress without changing JSON, authentication or cache privacy", async () => {
  const repository = new InMemoryAutomationRepository();
  const date = "2026-09-14T00:00:00.000Z";
  await repository.saveTrendSignals(Array.from({ length: 100 }, (_, i) => ({
    id: `trend-${i}`, sourceType: "naver_blog" as const, title: `보장 내용을 비교하는 기준 ${i}`, url: `https://example.test/${i}`,
    publishedAt: date, engagementScore: 0, relevanceScore: 80, trustScore: 50, topicKey: "보험", collectedAt: date,
  })));
  const app = buildApp({ system: createAutomationSystem({ repository }) });
  try {
    const plain = await app.inject({ method: "GET", url: "/api/trends", headers: { "accept-encoding": "identity" } });
    const zipped = await app.inject({ method: "GET", url: "/api/trends", headers: { "accept-encoding": "gzip" } });
    assert.equal(zipped.statusCode, 200);
    assert.equal(zipped.headers["content-encoding"], "gzip");
    assert.match(String(zipped.headers.vary), /accept-encoding/i);
    assert.equal(zipped.headers["cache-control"], "private, no-store");
    const decoded = JSON.parse(gunzipSync(zipped.rawPayload).toString());
    const original = plain.json();
    // Local mock metadata uses the current time; compare the actual saved data.
    assert.deepEqual(decoded.items, original.items);
    assert.equal(decoded.items.length, 100);
    assert.ok(zipped.rawPayload.length < plain.rawPayload.length * 0.3);
    for (const encoding of ["gzip;q=0, identity;q=1", "br"]) {
      const response = await app.inject({ method: "GET", url: "/api/trends", headers: { "accept-encoding": encoding } });
      assert.equal(response.headers["content-encoding"], undefined);
      assert.equal(response.json().items.length, 100);
    }
    const auth = await app.inject({ method: "GET", url: "/api/auth/session", headers: { "accept-encoding": "gzip" } });
    assert.equal(auth.statusCode, 200);
    assert.equal(auth.headers["content-encoding"], undefined);
    const small = await app.inject({ method: "GET", url: "/api/automation/runs", headers: { "accept-encoding": "gzip" } });
    assert.equal(small.headers["content-encoding"], undefined);
  } finally { await app.close(); }
});

test("compression does not change authentication, image bytes or accepted request encodings", async (context) => {
  const imageBytes = Buffer.alloc(4096, 42);
  const auth = new SessionAuthService({ username: "test", password: "test", sessionSecret: "compression-test-session-secret", secureCookie: false });
  const app = buildApp({ auth, githubAutomation: {
    getDraftImage: async () => ({ body: imageBytes, contentType: "image/jpeg", etag: "image-version" }),
  } as unknown as GitHubAutomationService });
  context.after(() => app.close());
  const headers = { "accept-encoding": "gzip", "x-requested-with": "dashboard" };
  const blocked = await app.inject({ method: "GET", url: "/api/trends", headers });
  assert.equal(blocked.statusCode, 401);
  assert.equal(blocked.headers["cache-control"], "private, no-store");
  const login = await app.inject({ method: "POST", url: "/api/auth/login", headers, payload: { username: "test", password: "test" } });
  assert.equal(login.statusCode, 200);
  assert.equal(login.headers["content-encoding"], undefined);
  const image = await app.inject({ method: "GET", url: "/api/contents/test/images/hero", headers: { ...headers, cookie: login.headers["set-cookie"] } });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-encoding"], undefined);
  assert.equal(image.headers["content-type"], "image/jpeg");
  assert.equal(image.headers.etag, '"image-version"');
  assert.deepEqual(image.rawPayload, imageBytes);
  const encodedRequest = await app.inject({
    method: "POST", url: "/api/auth/login",
    headers: { ...headers, "content-type": "application/json", "content-encoding": "gzip" },
    payload: gzipSync(JSON.stringify({ username: "test", password: "test" })),
  });
  // Existing JSON parsing rejects compressed requests; this plugin must not
  // silently make them valid login requests through automatic decompression.
  assert.ok(encodedRequest.statusCode >= 400);
  assert.equal(encodedRequest.headers["set-cookie"], undefined);
});
