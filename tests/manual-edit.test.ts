import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../server/http/app.js";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import { createAutomationSystem } from "../server/system.js";
import { GitHubAutomationService, type AutomationDraftDetail, type DashboardDraftState } from "../server/services/github-automation.js";
import { draftToDetail } from "../server/services/github-content-mapper.js";
import { testSystem } from "./helpers.js";

const changed = { title: "직접 수정한 원고 제목", body: "사용자가 직접 고친 본문입니다. 기존 원고의 이미지와 발행 기록은 보존되어야 합니다." };
function fixture() {
  const date = "2026-10-01T00:00:00.000Z";
  let state: DashboardDraftState = { schemaVersion: 1, runId: "321", revision: 1, reviewStatus: "pending", publicationStatus: "none",
    checks: { sources: false, advertising: false }, reason: null, approvedBy: null, rejectedBy: null, approvedAt: null, rejectedAt: null,
    scheduledAt: null, publishedAt: null, externalUrl: null, updatedAt: date, updatedBy: "system" };
  let writes = 0;
  let unavailable = false;
  let pipelineStatus = "CONTENT_READY";
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "fixture" }, (async (_url, init) => {
    if (init?.method === "PUT") {
      writes++;
      state = JSON.parse(Buffer.from(JSON.parse(String(init.body)).content, "base64").toString("utf8"));
      return Response.json({ content: { sha: `sha-${writes}` } });
    }
    return Response.json({ content: Buffer.from(JSON.stringify(state)).toString("base64"), sha: `sha-${writes}` });
  }) as typeof fetch);
  service.getDraft = async () => {
    if (unavailable) throw new Error("Upstream unavailable");
    return { runId: "321", title: state.manualEdit?.title ?? "저장된 원고 제목", topic: "보험", primaryKeyword: "보험", generatedAt: date,
      updatedAt: state.updatedAt, revision: state.revision, pipelineStatus, toneSkillApplied: true, reviewStatus: state.reviewStatus,
      publicationStatus: state.publicationStatus, scheduledAt: state.scheduledAt, publishedAt: state.publishedAt,
      articleMarkdown: state.manualEdit?.body ?? "원래 저장된 원고 본문입니다. 직접 수정 이전의 내용입니다.", copyPackage: "원고", sourcesMarkdown: "",
      article: { article: { title: "저장된 원고 제목" }, sources: [], factChecks: [] }, state: structuredClone(state),
    } as AutomationDraftDetail;
  };
  return { service, state: () => state, writes: () => writes, setUnavailable: () => { unavailable = true; }, setPipeline: (value: string) => { pipelineStatus = value; } };
}

class Snapshots extends InMemoryAutomationRepository {
  snapshots = new Map<string, { value: unknown; syncedAt: string }>();
  failWrites = false;
  async getSnapshot<T>(key: string) { return this.snapshots.get(key) as { value: T; syncedAt: string } ?? null; }
  async saveSnapshot(key: string, value: unknown) {
    if (this.failWrites) throw new Error("Mirror unavailable");
    this.snapshots.set(key, { value: structuredClone(value), syncedAt: new Date().toISOString() });
  }
}

test("오래된 캐시의 원고도 원본이 같으면 수정하며 저장된 상세를 바로 반환한다", async t => {
  const data = fixture();
  const repository = new Snapshots();
  const before = draftToDetail(await data.service.getDraft("321"));
  repository.snapshots.set("detail:321", { value: before, syncedAt: "2020-01-01T00:00:00Z" });
  const app = buildApp({ system: createAutomationSystem({ repository }), databaseProvider: "postgres", githubAutomation: data.service });
  t.after(() => app.close());
  assert.equal((await app.inject("/api/contents/321")).json().freshness.stale, true);
  const payload = { ...changed, expected: { versionId: before.versions.at(-1)!.id, updatedAt: before.content.updatedAt } };
  const saved = await app.inject({ method: "PATCH", url: "/api/contents/321", payload });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(saved.json().detail.versions.at(-1).body, changed.body);
  assert.equal(saved.json().detail.freshness.stale, false);
  assert.equal((await app.inject("/api/contents/321")).json().versions.at(-1).body, changed.body);
  assert.equal(data.writes(), 1);
  const stale = await app.inject({ method: "PATCH", url: "/api/contents/321", payload });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, "CONTENT_EDIT_STALE");
  assert.equal(data.writes(), 1, "an older editing tab cannot overwrite the new version");
});

test("저장 후 캐시 반영 실패는 저장 실패로 오인하지 않고 성공 원본을 반환한다", async t => {
  const data = fixture();
  const repository = new Snapshots();
  repository.failWrites = true;
  const app = buildApp({ system: createAutomationSystem({ repository }), databaseProvider: "postgres", githubAutomation: data.service });
  t.after(() => app.close());
  const response = await app.inject({ method: "PATCH", url: "/api/contents/321", payload: changed });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().mirrorSynced, false);
  assert.equal(response.json().detail.versions.at(-1).body, changed.body);
  assert.equal(data.writes(), 1);
});

test("GitHub 예약·발행 원고의 수동 수정은 발행 기록과 적용 이미지를 보존한다", async () => {
  for (const publicationStatus of ["none", "scheduled", "published"] as const) {
    const data = fixture();
    Object.assign(data.state(), { publicationStatus, scheduledAt: "2026-10-30T01:00:00Z", publishedAt: "2026-10-02T01:00:00Z",
      externalUrl: "https://blog.naver.com/hanwhains_carrot/123", approvalNumber: "확인필 테스트", imageSelection: {
        revision: 1, manifestKey: "same-manifest", assetIds: ["hero"], acknowledgedRejectedIds: ["hero"], selectedAt: "2026-10-01", selectedBy: "admin",
      } });
    const before = structuredClone(data.state());
    const saved = await data.service.editDraft("321", changed, "admin", data.state());
    for (const field of ["publicationStatus", "scheduledAt", "publishedAt", "externalUrl", "approvalNumber"] as const) assert.equal(saved[field], before[field]);
    assert.equal(saved.manualEdit?.body, changed.body);
    assert.deepEqual(saved.imageSelection, { ...before.imageSelection, revision: 2 });
    assert.equal(data.writes(), 1);
  }
});

test("원본 조회 실패·작성 중·삭제·권한 없음은 저장하지 않으며 실패 원고는 수정할 수 있다", async t => {
  const data = fixture();
  const app = buildApp({ githubAutomation: data.service });
  t.after(() => app.close());
  const send = (headers = {}) => app.inject({ method: "PATCH", url: "/api/contents/321", payload: changed, headers });
  assert.equal((await send({ "x-user-roles": "reviewer" })).statusCode, 403);
  data.setPipeline("DRAFTING");
  assert.equal((await send()).statusCode, 409);
  data.setPipeline("DRAFTING_FAILED");
  assert.equal((await send()).statusCode, 200);
  data.state().rewriteStatus = "queued";
  assert.equal((await send()).statusCode, 409);
  data.state().rewriteStatus = null;
  data.state().deletedAt = "2026-10-25T00:00:00Z";
  assert.equal((await send()).statusCode, 409);
  data.setUnavailable();
  assert.equal((await send()).statusCode, 500);
  assert.equal(data.writes(), 1);
});

test("로컬 저장소도 발행 상태와 이미지·심의필을 보존하며 버전 충돌을 거부한다", async t => {
  const system = testSystem();
  const app = buildApp({ system });
  t.after(() => app.close());
  const actor = { id: "admin", roles: ["admin"] as ["admin"] };
  const content = await system.contentService.create({ title: "수동 수정 테스트 원고", topic: "보험", strategy: "original", idempotencyKey: "manual-edit" }, actor);
  await system.contentService.runPipeline(content.id, "manual-edit-run", actor);
  const previous = (await system.contentService.detail(content.id)).versions.at(-1)!;
  await system.repository.saveVersion({ ...previous, metadata: { imagePackage: { status: "ready", assets: [{ id: "hero" }] }, approvalNumber: "확인필 테스트", copyPackageHtml: "old HTML" } });
  for (const state of ["scheduled", "published", "measured"] as const) {
    const current = (await system.repository.getContent(content.id))!;
    await system.repository.updateContent({ ...current, state, scheduledAt: "2026-11-01T00:00:00Z", publishedAt: "2026-10-01T00:00:00Z" });
    const detail = await system.contentService.detail(content.id);
    const payload = { ...changed, expected: { versionId: detail.versions.at(-1)!.id, updatedAt: detail.content.updatedAt } };
    const response = await app.inject({ method: "PATCH", url: `/api/contents/${content.id}`, payload });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().state, state);
    assert.equal(response.json().publishedAt, detail.content.publishedAt);
    assert.equal(response.json().scheduledAt, detail.content.scheduledAt);
    const saved = response.json().detail.versions.at(-1);
    assert.equal(saved.metadata.imagePackage.assets[0].id, "hero");
    assert.equal(saved.metadata.approvalNumber, "확인필 테스트");
    assert.equal(saved.metadata.copyPackageHtml, null);
    assert.equal(saved.metadata.copyPackage, changed.body);
    assert.equal((await app.inject({ method: "PATCH", url: `/api/contents/${content.id}`, payload })).statusCode, 409);
  }
});
