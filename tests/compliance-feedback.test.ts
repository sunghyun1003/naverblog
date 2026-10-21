import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildApp } from "../server/http/app.js";
import { GitHubAutomationService } from "../server/services/github-automation.js";
import { MemoryComplianceFeedbackStore, saveComplianceFeedback, feedbackDocumentSchema } from "../server/services/compliance-feedback.js";
import { SessionAuthService } from "../server/services/session-auth.js";
import { testSystem } from "./helpers.js";
import { suggestFeedbackScope, type ComplianceFeedbackInput } from "../shared/compliance-feedback.js";

const input: ComplianceFeedbackInput = { excerpt: "무조건 보장", guidance: "확약하지 말고 적용 조건을 설명해주세요.",
  replacement: "약관의 보장 조건을 확인해주세요.", scope: "auto", kind: "avoid", active: true };
const source = { title: "자동차보험 가입 조건", version: 2 };

test("feedback writes are independent, idempotent, reversible, and reject concurrent edits", async () => {
  const store = new MemoryComplianceFeedbackStore();
  const id = randomUUID();
  const saved = await saveComplianceFeedback(store, "123", id, 0, input, source, "reviewer");
  assert.equal(saved.revision, 1);
  assert.equal(saved.items[0]?.contentVersion, 2);
  assert.deepEqual(feedbackDocumentSchema.parse(saved), saved);
  assert.deepEqual(await saveComplianceFeedback(store, "123", id, 0, input, source, "reviewer"), saved);
  const results = await Promise.allSettled([
    saveComplianceFeedback(store, "123", id, 1, { ...input, active: false }, source, "reviewer"),
    saveComplianceFeedback(store, "123", randomUUID(), 1, input, source, "reviewer"),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  const current = await store.getComplianceFeedback("123");
  assert.equal(current.items[0]?.active, false);
  const restored = await saveComplianceFeedback(store, "123", id, current.revision, input, source, "reviewer");
  assert.equal(restored.items.length, 1);
  assert.equal(restored.items[0]?.createdAt, saved.items[0]?.createdAt);
  assert.equal(restored.items[0]?.active, true);
});

test("API stores review notes without changing the draft, state, versions, or jobs", async t => {
  const system = testSystem();
  const content = await system.contentService.create({ title: source.title, topic: "자동차보험", strategy: "original", idempotencyKey: "feedback-test" }, { id: "a", roles: ["admin"] });
  const app = buildApp({ system }); t.after(() => app.close());
  const url = `/api/contents/${content.id}/compliance-feedback`;
  assert.equal((await app.inject({ method: "GET", url })).json().items.length, 0);
  const id = randomUUID();
  const payload = { expectedRevision: 0, input };
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${id}`, payload, headers: { "x-user-roles": "editor" } })).statusCode, 403);
  const before = await system.contentService.detail(content.id);
  const saved = await app.inject({ method: "PUT", url: `${url}/${id}`, payload, headers: { "x-user-roles": "reviewer" } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.deepEqual(await system.contentService.detail(content.id), before);
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${randomUUID()}`, payload })).statusCode, 409);
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${id}`, payload: { expectedRevision: 1, input: { ...input, scope: "unknown" } } })).statusCode, 400);
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${id}`, payload: { expectedRevision: 1, input: { ...input, excerpt: "" } } })).statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: "/api/contents/missing/compliance-feedback" })).statusCode, 404);
});

test("feedback API requires login and the normal same-origin write header", async t => {
  const auth = new SessionAuthService({ username: "local", password: "fixture-password", sessionSecret: "fixture-secret-long-enough-for-test-only", secureCookie: false });
  const app = buildApp({ auth }); t.after(() => app.close());
  const url = `/api/contents/123/compliance-feedback/${randomUUID()}`;
  assert.equal((await app.inject({ method: "PUT", url, payload: {} })).statusCode, 401);
  const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "x-requested-with": "dashboard" }, payload: { username: "local", password: "fixture-password" } });
  assert.equal((await app.inject({ method: "PUT", url, headers: { cookie: login.headers["set-cookie"] }, payload: {} })).statusCode, 403);
});

test("private GitHub storage writes only the feedback file with SHA protection; no article or workflow mutation", async () => {
  let document: unknown = null;
  let sha = "";
  let conflict = false;
  const calls: Array<{ url: string; method: string }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.sha ?? "", sha);
      assert.equal(body.branch, "main");
      if (conflict) return Response.json({}, { status: 409 });
      document = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
      sha = "next-sha";
      return Response.json({});
    }
    return document ? Response.json({ sha, encoding: "base64", content: Buffer.from(JSON.stringify(document)).toString("base64") })
      : Response.json({}, { status: 404 });
  }) as typeof fetch;
  const store = new GitHubAutomationService({ owner: "fixture", repository: "private", branch: "main", token: "fixture-token" }, fetcher);
  const saved = await saveComplianceFeedback(store, "123", randomUUID(), 0, input, source, "reviewer");
  assert.deepEqual(await store.getComplianceFeedback("123"), saved);
  conflict = true;
  await assert.rejects(saveComplianceFeedback(store, "123", randomUUID(), 1, input, source, "reviewer"), { code: "FEEDBACK_CONFLICT" });
  assert.ok(calls.every(call => call.url.includes("/contents/dashboard/compliance-feedback/123.json")));
  document = { schemaVersion: 55 };
  await assert.rejects(store.getComplianceFeedback("123"), { code: "FEEDBACK_DATA_INVALID" });
  await assert.rejects(store.getComplianceFeedback("../secret"), { code: "INVALID_CONTENT_ID" });
});

test("feedback UI is lazy, keeps entered text across tabs, and uses independent requests", async () => {
  const page = await readFile(new URL("../src/features/review/ReviewPage.tsx", import.meta.url), "utf8");
  assert.match(page, /lazy\(\(\) => import\("\.\/ComplianceFeedbackPanel"\)\)/);
  assert.match(page, /hidden=\{tab !== "compliance"\}/);
  const client = await readFile(new URL("../src/api/client.ts", import.meta.url), "utf8");
  assert.match(client, /getComplianceFeedback[\s\S]*?return requestNetwork/);
  assert.equal(suggestFeedbackScope("운전자보험 벌금"), "driver");
  assert.equal(suggestFeedbackScope("한화손보 캐롯 자동차보험"), "auto");
});
