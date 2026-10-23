import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { buildApp } from "../server/http/app.js";
import { GitHubAutomationService } from "../server/services/github-automation.js";
import { MemoryPublicationRecordStore, publicationRecordDocumentSchema, publicationRecordView, savePublicationRecord } from "../server/services/publication-record.js";
import { SessionAuthService } from "../server/services/session-auth.js";
import { isNaverBlogUrl } from "../shared/publication-record.js";
import { testSystem } from "./helpers.js";

const originalUrl = "https://blog.naver.com/cest_la_mode/123";
const input = { externalUrl: "https://m.blog.naver.com/cest_la_mode/456", note: "네이버에서 첫 문단을 심의 의견에 맞게 수정했습니다." };

test("publication records inherit the initial URL, append safely, and retain deliberate URL removal", async () => {
  const store = new MemoryPublicationRecordStore();
  assert.equal(publicationRecordView(await store.getPublicationRecord("123"), originalUrl).externalUrl, originalUrl);
  const id = randomUUID();
  const saved = await savePublicationRecord(store, "123", id, 0, input, originalUrl, "publisher");
  assert.deepEqual(publicationRecordDocumentSchema.parse(saved), saved);
  assert.equal(saved.revision, 1);
  assert.deepEqual(await savePublicationRecord(store, "123", id, 0, input, originalUrl, "publisher"), saved);
  await assert.rejects(savePublicationRecord(store, "123", id, 1, { ...input, note: "다른 내용" }, originalUrl, "publisher"), { code: "PUBLICATION_RECORD_CONFLICT" });
  const outcomes = await Promise.allSettled([1, 2].map(() => savePublicationRecord(store, "123", randomUUID(), 1, input, originalUrl, "publisher")));
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
  const cleared = await savePublicationRecord(store, "123", randomUUID(), 2, { externalUrl: "", note: "잘못 등록한 링크 제거" }, originalUrl, "publisher");
  assert.equal(publicationRecordView(cleared, originalUrl).externalUrl, null);
  assert.equal(cleared.entries[0]?.externalUrl, input.externalUrl);
  assert.equal(cleared.entries.length, 3);
});

test("unchanged records are not written and stale/over-limit records cannot overwrite history", async () => {
  const store = new MemoryPublicationRecordStore();
  const unchanged = await savePublicationRecord(store, "123", randomUUID(), 0, { externalUrl: originalUrl, note: "" }, originalUrl, "p");
  assert.equal(unchanged.revision, 0);
  assert.equal((await store.getPublicationRecord("123")).externalUrl, null);
  const saved = await savePublicationRecord(store, "123", randomUUID(), 0, input, originalUrl, "p");
  await assert.rejects(savePublicationRecord(store, "123", randomUUID(), 0, input, originalUrl, "p"), { code: "PUBLICATION_RECORD_CONFLICT" });
  const full = { ...saved, revision: 100, entries: Array.from({ length: 100 }, () => ({ ...saved.entries[0]!, id: randomUUID() })) };
  await store.comparePublicationRecord(full, 1);
  await assert.rejects(savePublicationRecord(store, "123", randomUUID(), 100, input, originalUrl, "p"), { code: "PUBLICATION_RECORD_LIMIT" });
  assert.equal((await store.getPublicationRecord("123")).entries.length, 100);
});

test("only safe desktop/mobile NAVER HTTPS links are accepted", () => {
  for (const value of [originalUrl, input.externalUrl, "https://blog.naver.com/PostView.naver?blogId=test&logNo=123"]) assert.equal(isNaverBlogUrl(value), true, value);
  for (const value of ["javascript:alert(1)", "http://blog.naver.com/a", "https://blog.naver.com.evil.com/a", "https://blog.naver.com@evil.com/a", "https://evil.com/a", "https://blog.naver.com/", "https://user:pw@blog.naver.com/a", "https://blog.naver.com:8080/a"]) assert.equal(isNaverBlogUrl(value), false, value);
});

test("API publication notes preserve all manuscript data, require publication permission, and reject invalid states", async t => {
  const system = testSystem();
  const content = await system.contentService.create({ title: "자동차보험 발행 기록 테스트", topic: "자동차보험", strategy: "original", idempotencyKey: "publication-record" }, { id: "a", roles: ["admin"] });
  const app = buildApp({ system }); t.after(() => app.close());
  const url = `/api/contents/${content.id}/publication-record`;
  assert.equal((await app.inject({ method: "GET", url })).statusCode, 409);
  await system.repository.updateContent({ ...content, state: "published", publishedAt: content.createdAt });
  await system.repository.savePublication({ id: "p", contentId: content.id, status: "published", externalUrl: originalUrl,
    publishedAt: content.createdAt, scheduledAt: null, createdAt: content.createdAt, updatedAt: content.createdAt });
  const before = await system.contentService.detail(content.id);
  assert.equal((await app.inject({ method: "GET", url })).json().externalUrl, originalUrl);
  const id = randomUUID();
  const payload = { expectedRevision: 0, input };
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${id}`, payload, headers: { "x-user-roles": "editor" } })).statusCode, 403);
  const saved = await app.inject({ method: "PUT", url: `${url}/${id}`, payload, headers: { "x-user-roles": "publisher" } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${id}`, payload })).json().entries.length, 1);
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${randomUUID()}`, payload })).statusCode, 409);
  for (const invalid of [{ ...input, externalUrl: "https://evil.com/a" }, { ...input, note: "x".repeat(2001) }, { ...input, body: "must not edit the manuscript" }]) {
    assert.equal((await app.inject({ method: "PUT", url: `${url}/${randomUUID()}`, payload: { expectedRevision: 1, input: invalid } })).statusCode, 400);
  }
  assert.deepEqual(await system.contentService.detail(content.id), before);
  assert.equal((await app.inject({ method: "GET", url })).json().externalUrl, input.externalUrl);
  await system.repository.updateContent({ ...before.content, state: "deleted" });
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${randomUUID()}`, payload: { expectedRevision: 1, input } })).statusCode, 409);
  assert.equal((await app.inject({ method: "GET", url: "/api/contents/missing/publication-record" })).statusCode, 404);
});

test("publication API requires login and same-origin write header", async t => {
  const auth = new SessionAuthService({ username: "test", password: "fixture-password", sessionSecret: "fixture-secret-long-enough-for-test-only", secureCookie: false });
  const app = buildApp({ auth }); t.after(() => app.close());
  const url = `/api/contents/123/publication-record/${randomUUID()}`;
  assert.equal((await app.inject({ method: "PUT", url, payload: {} })).statusCode, 401);
  const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "x-requested-with": "dashboard" }, payload: { username: "test", password: "fixture-password" } });
  assert.equal((await app.inject({ method: "PUT", url, headers: { cookie: login.headers["set-cookie"] }, payload: {} })).statusCode, 403);
});

test("GitHub reads only small metadata files and writes only publication records with SHA protection", async () => {
  let document: unknown = null;
  let sha = "";
  let conflict = false;
  let status = "published";
  let deletedAt: string | null = null;
  const calls: Array<{ url: string; method: string }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    calls.push({ url: path, method: init?.method ?? "GET" });
    if (path.includes("/decisions/")) return Response.json({ encoding: "base64", content: Buffer.from(JSON.stringify({ publicationStatus: status, externalUrl: originalUrl, deletedAt })).toString("base64") });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.sha ?? "", sha);
      assert.equal(body.branch, "main");
      if (conflict) return Response.json({}, { status: 409 });
      document = JSON.parse(Buffer.from(body.content, "base64").toString("utf8")); sha = "next-sha";
      return Response.json({});
    }
    return document ? Response.json({ sha, encoding: "base64", content: Buffer.from(JSON.stringify(document)).toString("base64") }) : Response.json({}, { status: 404 });
  }) as typeof fetch;
  const store = new GitHubAutomationService({ owner: "fixture", repository: "private", branch: "main", token: "fixture-token" }, fetcher);
  assert.equal(await store.getPublishedPostUrl("123"), originalUrl);
  status = "scheduled";
  await assert.rejects(store.getPublishedPostUrl("123"), { code: "CONTENT_NOT_PUBLISHED" });
  status = "published"; deletedAt = new Date().toISOString();
  await assert.rejects(store.getPublishedPostUrl("123"), { code: "CONTENT_NOT_PUBLISHED" });
  const saved = await savePublicationRecord(store, "123", randomUUID(), 0, input, originalUrl, "publisher");
  assert.deepEqual(await store.getPublicationRecord("123"), saved);
  conflict = true;
  await assert.rejects(savePublicationRecord(store, "123", randomUUID(), 1, input, originalUrl, "publisher"), { code: "PUBLICATION_RECORD_CONFLICT" });
  assert.ok(calls.filter(call => call.method !== "GET").every(call => call.url.includes("/contents/dashboard/publication-records/123.json")));
  assert.ok(calls.every(call => call.url.includes("/publication-records/") || call.url.includes("/decisions/")));
  document = { schemaVersion: 55 };
  await assert.rejects(store.getPublicationRecord("123"), { code: "PUBLICATION_RECORD_DATA_INVALID" });
  await assert.rejects(store.getPublicationRecord("../secret"), { code: "INVALID_CONTENT_ID" });
  await assert.rejects(store.getPublishedPostUrl("../secret"), { code: "INVALID_CONTENT_ID" });
});
