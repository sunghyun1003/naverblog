import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../server/http/app.js";
import { DomainError } from "../server/domain/errors.js";
import type { TrendSignal } from "../server/domain/types.js";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import {
  GitHubAutomationService,
  type AutomationDraftDetail,
  type DashboardDraftState,
} from "../server/services/github-automation.js";
import { persistGitHubDraftDetail } from "../server/services/github-persistence.js";
import { createAutomationSystem } from "../server/system.js";
import { testSystem } from "./helpers.js";

function reviewDraft(runId: string, title = `검토 원고 ${runId}`, state?: DashboardDraftState): AutomationDraftDetail {
  const generatedAt = "2026-08-24T00:00:00.000Z";
  const currentState = state ?? {
    schemaVersion: 1,
    runId,
    reviewStatus: "pending",
    publicationStatus: "none",
    checks: { sources: false, advertising: false },
    reason: null,
    approvedBy: null,
    rejectedBy: null,
    approvedAt: null,
    rejectedAt: null,
    scheduledAt: null,
    publishedAt: null,
    externalUrl: null,
    updatedAt: generatedAt,
    updatedBy: "system",
  };
  return {
    runId,
    title,
    topic: "보험",
    primaryKeyword: "보험",
    generatedAt,
    pipelineStatus: "TONE_REVIEW_COMPLETE",
    toneSkillApplied: true,
    updatedAt: currentState.updatedAt,
    reviewStatus: currentState.reviewStatus,
    publicationStatus: currentState.publicationStatus,
    scheduledAt: currentState.scheduledAt,
    publishedAt: currentState.publishedAt,
    articleMarkdown: `# ${title}`,
    copyPackage: title,
    sourcesMarkdown: "- 출처",
    article: {
      article: { title },
      planning: { topic: "보험" },
      seo: { primaryKeyword: "보험" },
      factChecks: [{ claim: "확인할 내용", status: "NEEDS_REVIEW", verificationNote: "사람이 확인합니다." }],
      sources: [{ title: "참고 글", url: `https://blog.naver.com/example/${runId}` }],
    },
    state: currentState,
  };
}

function completedDraft(runId: string, title = `완성 원고 ${runId}`): AutomationDraftDetail {
  const result = reviewDraft(runId, title);
  result.pipelineStatus = "CONTENT_READY";
  result.imageGenerationStatus = "ready";
  result.reviewStatus = "approved";
  result.autoApproved = true;
  result.state.reviewStatus = "approved";
  result.state.autoApproved = true;
  result.imageManifest = {
    schemaVersion: 1,
    status: "ready",
    generatedAt: result.generatedAt,
    runId: result.runId,
    sourceRevision: 1,
    styleProfileId: "insurance-editorial-v1",
    technicalQualityPassed: true,
    visualQualityPassed: true,
    humanReviewRequired: true,
    visualQuality: { overallPassed: true, summary: "통과", assets: [] },
    checks: [],
    assets: [{
      id: "hero",
      role: "hero",
      kind: "ai_generated",
      path: "hero.jpg",
      afterSection: 0,
      purpose: "concept",
      altText: "대표 이미지",
      width: 1200,
      height: 800,
      bytes: 1000,
      sha256: "abc",
    }],
  };
  return result;
}

function changedState(
  draft: AutomationDraftDetail,
  changes: Partial<DashboardDraftState>,
  actor: string,
): DashboardDraftState {
  return {
    ...draft.state,
    ...changes,
    schemaVersion: 1,
    runId: draft.runId,
    updatedAt: "2026-08-24T01:00:00.000Z",
    updatedBy: actor,
  };
}

test("GitHub 운영 모드에서는 저장소 콘텐츠를 운영 데이터 저장소로 표시한다", async (context) => {
  const githubAutomation = new GitHubAutomationService({
    owner: "owner",
    repository: "automation",
    branch: "main",
    token: "test-token",
  });
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/system/capabilities" });
  assert.equal(response.statusCode, 200);
  const capabilities = response.json<{ integrations: Record<string, { configured: boolean; provider: string }> }>();
  assert.deepEqual(capabilities.integrations.database, { configured: true, provider: "github-contents" });
  assert.equal("youtube" in capabilities.integrations, false);
  assert.equal("slack" in capabilities.integrations, false);
});

test("자동 실행 설정 저장 시 GitHub 연결 권한 실패를 구체적 메시지로 반환한다", async (context) => {
  const workflowSource = `name: test\n\non:\n  # dashboard-schedule:start\n  schedule:\n    - cron: \"0 7 * * *\"\n      timezone: \"Asia/Seoul\"\n  # dashboard-schedule:end\n  workflow_dispatch:\n`;
  const encodedWorkflow = Buffer.from(workflowSource, "utf8").toString("base64");
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes(".github/workflows/collect.yml") || url.includes(".github/workflows/generate.yml")) {
      return new Response(JSON.stringify({ content: encodedWorkflow, encoding: "base64", sha: "workflow-sha" }), { status: 200 });
    }
    if (url.endsWith("/git/ref/heads/main") && method === "GET") {
      return new Response(JSON.stringify({ message: "Resource not accessible by personal access token" }), { status: 403 });
    }
    return new Response(JSON.stringify({ message: "Unexpected request" }), { status: 500 });
  }) as typeof fetch;
  const githubAutomation = new GitHubAutomationService({ owner: "owner", repository: "automation", branch: "main", token: "read-only-token" }, request);
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/api/automation/settings",
    payload: {
      schemaVersion: 1,
      timezone: "Asia/Seoul",
      collection: { enabled: true, frequency: "daily", time: "06:30", weekday: 1 },
      generation: { enabled: true, frequency: "daily", time: "07:00", weekday: 1, count: 1 },
    },
  });

  assert.equal(response.statusCode, 502);
  const body = response.json<{ error: { code: string; message: string; details: { githubStatus: number } } }>();
  assert.equal(body.error.code, "GITHUB_AUTOMATION_WRITE_FAILED");
  assert.equal(body.error.details.githubStatus, 403);
  assert.match(body.error.message, /쓰기 권한/);
});

test("Neon 동기화가 실패해도 GitHub 트렌드는 화면에 반환한다", async (context) => {
  class FailingTrendRepository extends InMemoryAutomationRepository {
    override async saveTrendSignals(_signals: TrendSignal[]): Promise<TrendSignal[]> {
      throw new Error("database constraint");
    }
  }
  const request = (async (input: string | URL | Request) => {
    if (String(input).includes("data/latest.json")) {
      const content = Buffer.from(JSON.stringify({
        collectionDate: "2026-08-24",
        collectedAt: "2026-08-24T00:00:00Z",
        items: [{ title: "실손보험", link: "https://blog.naver.com/example/1", candidateScore: 190 }],
      })).toString("base64");
      return new Response(JSON.stringify({ content, encoding: "base64", sha: "sha-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  }) as typeof fetch;
  const repository = new FailingTrendRepository();
  const githubAutomation = new GitHubAutomationService({ owner: "owner", repository: "automation", branch: "main", token: "test-token" }, request);
  const app = buildApp({ system: createAutomationSystem({ repository }), githubAutomation, databaseProvider: "postgres" });
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/trends" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ items: unknown[] }>().items.length, 1);
});

test("오늘 수집한 Neon 캐시는 목록 화면에서 GitHub 응답을 기다리지 않는다", async (context) => {
  const system = testSystem();
  const content = await system.contentService.create(
    { title: "실손보험 전환 확인", topic: "실손보험", strategy: "trend", idempotencyKey: "cached-content" },
    { id: "admin", roles: ["admin"] },
  );
  await system.contentService.runPipeline(content.id, "cached-pipeline", { id: "admin", roles: ["admin"] });
  const cachedSignals = await system.repository.listTrendSignals();
  await system.repository.saveTrendSignals(cachedSignals.map((signal) => ({ ...signal, collectedAt: new Date().toISOString() })));
  let githubRequests = 0;
  const githubAutomation = new GitHubAutomationService(
    { owner: "owner", repository: "automation", branch: "main", token: "test-token" },
    (async () => {
      githubRequests += 1;
      throw new Error("GitHub should not be called");
    }) as typeof fetch,
  );
  const app = buildApp({ system, githubAutomation, databaseProvider: "postgres" });
  context.after(() => app.close());

  const [contents, trends, detail] = await Promise.all([
    app.inject({ method: "GET", url: "/api/contents" }),
    app.inject({ method: "GET", url: "/api/trends" }),
    app.inject({ method: "GET", url: `/api/contents/${content.id}` }),
  ]);

  assert.equal(contents.statusCode, 200);
  assert.equal(trends.statusCode, 200);
  assert.equal(detail.statusCode, 200);
  assert.equal(contents.json<{ freshness: { source: string; stale: boolean } }>().freshness.source, "postgres-cache");
  assert.equal(contents.json<{ freshness: { source: string; stale: boolean } }>().freshness.stale, false);
  assert.equal(detail.json<{ freshness: { source: string; stale: boolean } }>().freshness.stale, false);
  assert.equal(githubRequests, 0);

  const forced = await app.inject({ method: "GET", url: "/api/contents?refresh=true" });
  assert.equal(forced.statusCode, 200);
  assert.equal(forced.json<{ freshness: { source: string; stale: boolean } }>().freshness.source, "postgres-cache");
  assert.equal(forced.json<{ freshness: { source: string; stale: boolean } }>().freshness.stale, true);
  const forcedDetail = await app.inject({ method: "GET", url: `/api/contents/${content.id}?refresh=true` });
  assert.equal(forcedDetail.statusCode, 200);
  assert.equal(forcedDetail.json<{ freshness: { source: string; stale: boolean } }>().freshness.source, "postgres-cache");
  assert.equal(forcedDetail.json<{ freshness: { source: string; stale: boolean } }>().freshness.stale, true);
  assert.equal(githubRequests, 2);
});

test("HTTP API로 생성부터 검수 상세 조회까지 실행한다", async (context) => {
  const system = testSystem();
  const app = buildApp({ system });
  context.after(() => app.close());

  const createdResponse = await app.inject({
    method: "POST",
    url: "/api/contents",
    headers: { "x-user-id": "planner-1", "x-user-roles": "planner", "x-idempotency-key": "api-content-1" },
    payload: { title: "연금보험과 연금저축은 어떻게 다를까?", topic: "연금보험 연금저축 차이", strategy: "trend" },
  });
  assert.equal(createdResponse.statusCode, 201);
  const content = createdResponse.json<{ id: string; state: string }>();
  assert.equal(content.state, "idea");

  const pipelineResponse = await app.inject({
    method: "POST",
    url: `/api/contents/${content.id}/pipeline`,
    headers: { "x-user-id": "planner-1", "x-user-roles": "planner", "x-idempotency-key": "api-pipeline-1" },
  });
  assert.equal(pipelineResponse.statusCode, 202);
  assert.equal(pipelineResponse.json<{ status: string }>().status, "succeeded");

  const detailResponse = await app.inject({ method: "GET", url: `/api/contents/${content.id}` });
  assert.equal(detailResponse.statusCode, 200);
  const detail = detailResponse.json<{ content: { state: string }; versions: unknown[]; claims: unknown[] }>();
  assert.equal(detail.content.state, "review_ready");
  assert.equal(detail.versions.length, 5);
  assert.equal(detail.claims.length, 3);
});

test("원고 직접 수정은 수동 버전으로 저장하고 삭제하면 모든 저장소에서 제거한다", async (context) => {
  const system = testSystem();
  const app = buildApp({ system });
  context.after(() => app.close());
  const actorHeaders = { "x-user-id": "admin", "x-user-roles": "admin" };
  const content = await system.contentService.create(
    { title: "자동차보험 비교 원고", topic: "자동차보험 비교", strategy: "trend", idempotencyKey: "api-edit-delete" },
    { id: "admin", roles: ["admin"] },
  );
  await system.contentService.runPipeline(content.id, "api-edit-delete-pipeline", { id: "admin", roles: ["admin"] });

  const edited = await app.inject({
    method: "PATCH",
    url: `/api/contents/${content.id}`,
    headers: actorHeaders,
    payload: {
      title: "자동차보험 보험료 비교 방법",
      body: "자동차보험 보험료를 비교할 때는 보장 범위와 특약 포함 여부를 먼저 확인해요.",
      reason: "보험료와 보장 범위를 구체적으로 표현",
    },
  });
  assert.equal(edited.statusCode, 200);
  assert.equal(edited.json<{ state: string }>().state, "review_ready");
  const editedDetail = await app.inject({ method: "GET", url: `/api/contents/${content.id}` });
  assert.equal(editedDetail.json<{ versions: Array<{ stage: string; title: string }> }>().versions.at(-1)?.stage, "manual");

  const deleted = await app.inject({ method: "DELETE", url: `/api/contents/${content.id}`, headers: actorHeaders });
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.json<{ state: string }>().state, "deleted");
  const deletedDetail = await app.inject({ method: "GET", url: `/api/contents/${content.id}` });
  assert.equal(deletedDetail.statusCode, 404);
  const listed = await app.inject({ method: "GET", url: "/api/contents" });
  assert.equal(listed.json<{ items: Array<{ id: string }> }>().items.some((item) => item.id === content.id), false);
});

test("콘텐츠 일괄 삭제는 선택한 원고를 모든 저장소에서 제거한다", async (context) => {
  const system = testSystem();
  const app = buildApp({ system });
  context.after(() => app.close());
  const actor = { id: "admin", roles: ["admin"] as const };
  const first = await system.contentService.create(
    { title: "일괄 삭제 첫 번째 원고", topic: "자동차보험", strategy: "trend", idempotencyKey: "bulk-delete-1" },
    actor,
  );
  const second = await system.contentService.create(
    { title: "일괄 삭제 두 번째 원고", topic: "자동차보험", strategy: "trend", idempotencyKey: "bulk-delete-2" },
    actor,
  );

  const response = await app.inject({
    method: "POST",
    url: "/api/contents/bulk-delete",
    payload: { ids: [first.id, second.id, first.id] },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ items: unknown[]; failures: unknown[] }>().items.length, 2);
  assert.equal(response.json<{ items: unknown[]; failures: unknown[] }>().failures.length, 0);
  assert.equal((await system.contentService.list()).some((item) => [first.id, second.id].includes(item.id)), false);
});

test("권한 없는 역할의 승인을 거부한다", async (context) => {
  const system = testSystem();
  const app = buildApp({ system });
  context.after(() => app.close());
  const content = await system.contentService.create(
    { title: "치아보험 가입 전 확인할 면책기간", topic: "치아보험 면책기간", strategy: "trend", idempotencyKey: "api-content-2" },
    { id: "admin", roles: ["admin"] },
  );
  await system.contentService.runPipeline(content.id, "api-pipeline-2", { id: "admin", roles: ["admin"] });

  const response = await app.inject({
    method: "POST",
    url: `/api/contents/${content.id}/approve`,
    headers: { "x-user-id": "editor-1", "x-user-roles": "editor" },
    payload: { checks: { sources: true, advertising: true } },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json<{ error: { code: string } }>().error.code, "FORBIDDEN");
});

test("반려 사유는 5자 이상 검증하고 성공한 반려를 저장한다", async (context) => {
  const system = testSystem();
  const app = buildApp({ system });
  context.after(() => app.close());
  const actor = { id: "admin", roles: ["admin"] as const };
  const content = await system.contentService.create(
    { title: "보험금 청구 원고 검수", topic: "보험금 청구", strategy: "trend", idempotencyKey: "api-rejection" },
    actor,
  );
  await system.contentService.runPipeline(content.id, "api-rejection-pipeline", actor);

  const invalid = await app.inject({
    method: "POST",
    url: `/api/contents/${content.id}/reject`,
    headers: { "x-user-id": "admin", "x-user-roles": "admin" },
    payload: { reason: "수정필요" },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json<{ error: { code: string } }>().error.code, "INVALID_REQUEST");
  assert.equal(invalid.json<{ error: { message: string } }>().error.message, "반려 사유는 5자 이상 입력해주세요.");

  const accepted = await app.inject({
    method: "POST",
    url: `/api/contents/${content.id}/reject`,
    headers: { "x-user-id": "admin", "x-user-roles": "admin" },
    payload: { reason: "출처를 다시 확인해주세요." },
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.json<{ state: string }>().state, "drafting");
  assert.equal((await system.repository.listApprovals(content.id)).length, 1);
  assert.equal((await system.repository.listAuditEvents(content.id)).at(-1)?.action, "content.rejected");
});

test("GitHub 원고는 검토 대기 상태에서만 승인하거나 반려할 수 있다", async (context) => {
  let reviewStatus: "approved" | "rejected" = "rejected";
  let publicationStatus: "none" | "scheduled" = "none";
  let updates = 0;
  const githubAutomation = {
    getDraft: async () => ({ reviewStatus, publicationStatus, pipelineStatus: "TONE_REVIEW_COMPLETE" }),
    updateState: async () => { updates += 1; },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());
  const headers = { "x-user-id": "admin", "x-user-roles": "admin" };

  const approveRejected = await app.inject({
    method: "POST",
    url: "/api/contents/321/approve",
    headers,
    payload: { checks: { sources: true, advertising: true } },
  });
  assert.equal(approveRejected.statusCode, 409);
  assert.equal(approveRejected.json<{ error: { code: string } }>().error.code, "CONTENT_NOT_REVIEW_READY");

  reviewStatus = "approved";
  publicationStatus = "scheduled";
  const rejectScheduled = await app.inject({
    method: "POST",
    url: "/api/contents/321/reject",
    headers,
    payload: { reason: "출처를 다시 확인해주세요." },
  });
  assert.equal(rejectScheduled.statusCode, 409);
  assert.equal(rejectScheduled.json<{ error: { code: string } }>().error.code, "CONTENT_NOT_REVIEW_READY");
  assert.equal(updates, 0);
});

test("GitHub 원고는 품질 검사가 실패해도 반려로 재작성을 요청할 수 있다", async (context) => {
  let draft = reviewDraft("322", "품질 실패 원고");
  draft.pipelineStatus = "TONE_REVIEW_FAILED";
  draft.toneSkillApplied = false;
  const githubAutomation = {
    getDraft: async () => draft,
    updateState: async (
      _runId: string,
      changes: Partial<DashboardDraftState>,
      actor: string,
      currentState?: DashboardDraftState,
    ) => {
      assert.equal(currentState, draft.state);
      const state = changedState(draft, changes, actor);
      draft = reviewDraft(draft.runId, draft.title, state);
      draft.pipelineStatus = "TONE_REVIEW_FAILED";
      draft.toneSkillApplied = false;
      return state;
    },
    dispatch: async (workflow: string, inputs: Record<string, string>) => {
      assert.equal(workflow, "rewrite");
      assert.equal(inputs.run_id, "322");
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/contents/322/reject",
    payload: { reason: "말투 점검에서 실패한 문장을 다시 다듬어 주세요." },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ state: string }>().state, "drafting");
  assert.equal(response.json<{ rewriteQueued: boolean }>().rewriteQueued, true);
});

test("저장된 말투 피드백만 다시 실행하는 복구 요청은 전체 생성을 반복하지 않는다", async (context) => {
  const draft = reviewDraft("tone-resume-1") as AutomationDraftDetail & { toneVerdict: "REWRITE_REQUIRED" };
  draft.pipelineStatus = "TONE_REVIEW_REQUIRED";
  draft.toneVerdict = "REWRITE_REQUIRED";
  let dispatched: Record<string, string> | null = null;
  const githubAutomation = new GitHubAutomationService({ owner: "owner", repository: "automation", branch: "main", token: "test-token" }, (async () => {
    return new Response(JSON.stringify({ message: "unexpected GitHub request" }), { status: 500 });
  }) as typeof fetch);
  githubAutomation.getDraft = async () => draft;
  githubAutomation.updateState = async (_runId, changes, actor, currentState) => changedState({ ...draft, state: currentState ?? draft.state }, changes, actor);
  githubAutomation.dispatch = async (_workflow, inputs) => { dispatched = inputs; };
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/contents/tone-resume-1/tone-resume",
    headers: { "x-user-id": "carrot", "x-user-roles": "admin", "x-requested-with": "dashboard" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ rewriteQueued: boolean; recoveryMode: string }>().rewriteQueued, true);
  assert.equal(response.json<{ recoveryMode: string }>().recoveryMode, "tone_resume");
  assert.deepEqual(dispatched, { run_id: "tone-resume-1", mode: "tone_resume" });
});

test("서로 다른 GitHub 원고를 연속으로 반려한다", async (context) => {
  const drafts = new Map([
    ["101", reviewDraft("101", "첫 번째 검토 원고")],
    ["202", reviewDraft("202", "두 번째 검토 원고")],
  ]);
  const updatedRuns: string[] = [];
  const rewrittenRuns: string[] = [];
  const githubAutomation = {
    getDraft: async (runId: string) => drafts.get(runId)!,
    updateState: async (
      runId: string,
      changes: Partial<DashboardDraftState>,
      actor: string,
      currentState?: DashboardDraftState,
    ) => {
      const draft = drafts.get(runId)!;
      assert.equal(currentState, draft.state);
      const state = changedState(draft, changes, actor);
      drafts.set(runId, reviewDraft(runId, draft.title, state));
      updatedRuns.push(runId);
      return state;
    },
    dispatch: async (workflow: string, inputs: Record<string, string>) => {
      assert.equal(workflow, "rewrite");
      rewrittenRuns.push(inputs.run_id!);
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const first = await app.inject({
    method: "POST",
    url: "/api/contents/101/reject",
    payload: { reason: "첫 번째 원고의 출처를 다시 확인해주세요." },
  });
  const second = await app.inject({
    method: "POST",
    url: "/api/contents/202/reject",
    payload: { reason: "두 번째 원고의 표현을 다시 확인해주세요." },
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.json<{ state: string }>().state, "drafting");
  assert.equal(second.json<{ state: string }>().state, "drafting");
  assert.equal(first.json<{ rewriteQueued: boolean }>().rewriteQueued, true);
  assert.equal(second.json<{ rewriteQueued: boolean }>().rewriteQueued, true);
  assert.deepEqual(updatedRuns, ["101", "202"]);
  assert.deepEqual(rewrittenRuns, ["101", "202"]);
});

test("GitHub 반려 저장 후 Neon 미러가 실패해도 성공을 반환한다", async (context) => {
  class FailingMirrorRepository extends InMemoryAutomationRepository {
    override async saveSources(): Promise<never> {
      throw new Error("foreign key constraint");
    }
  }
  let draft = reviewDraft("303", "미러 실패 검증 원고");
  const githubAutomation = {
    getDraft: async () => draft,
    updateState: async (
      _runId: string,
      changes: Partial<DashboardDraftState>,
      actor: string,
      currentState?: DashboardDraftState,
    ) => {
      assert.equal(currentState, draft.state);
      const state = changedState(draft, changes, actor);
      draft = reviewDraft(draft.runId, draft.title, state);
      return state;
    },
    dispatch: async () => undefined,
  } as unknown as GitHubAutomationService;
  const repository = new FailingMirrorRepository();
  const app = buildApp({
    system: createAutomationSystem({ repository }),
    githubAutomation,
    databaseProvider: "postgres",
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/contents/303/reject",
    payload: { reason: "근거 자료를 다시 확인해주세요." },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ state: string }>().state, "drafting");
  assert.equal(response.json<{ mirrorSynced: boolean }>().mirrorSynced, false);
  assert.equal(response.json<{ rewriteQueued: boolean }>().rewriteQueued, true);
  assert.equal(draft.state.reviewStatus, "rejected");
});

test("반려 재작성 실행 요청이 실패하면 원고에 실패 상태를 기록한다", async (context) => {
  let draft = reviewDraft("304", "재작성 요청 실패 원고");
  const githubAutomation = {
    getDraft: async () => draft,
    updateState: async (
      _runId: string,
      changes: Partial<DashboardDraftState>,
      actor: string,
      currentState?: DashboardDraftState,
    ) => {
      assert.equal(currentState, draft.state);
      const state = changedState(draft, changes, actor);
      draft = reviewDraft(draft.runId, draft.title, state);
      return state;
    },
    dispatch: async () => { throw new Error("workflow unavailable"); },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/contents/304/reject",
    payload: { reason: "구체적인 사례를 추가해주세요." },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ rewriteQueued: boolean }>().rewriteQueued, false);
  assert.equal(response.json<{ rewriteStatus: string }>().rewriteStatus, "failed");
  assert.equal(draft.state.reviewStatus, "rejected");
  assert.equal(draft.state.rewriteStatus, "failed");
});

test("원고 상세 refresh는 캐시 대신 최신 GitHub 원고를 우선한다", async (context) => {
  const repository = new InMemoryAutomationRepository();
  const cachedDraft = reviewDraft("404", "캐시 원고");
  cachedDraft.imageGenerationStatus = "failed";
  cachedDraft.imageStatus = {
    schemaVersion: 1,
    status: "failed",
    updatedAt: cachedDraft.updatedAt,
    runId: cachedDraft.runId,
    message: "이전 이미지 생성 실패",
  };
  await persistGitHubDraftDetail(repository, cachedDraft);
  let githubRequests = 0;
  const githubAutomation = {
    getDraft: async () => {
      githubRequests += 1;
      return reviewDraft("404", "최신 GitHub 원고");
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({
    system: createAutomationSystem({ repository }),
    githubAutomation,
    databaseProvider: "postgres",
  });
  context.after(() => app.close());

  const cached = await app.inject({ method: "GET", url: "/api/contents/404" });
  const refreshed = await app.inject({ method: "GET", url: "/api/contents/404?refresh=true" });

  assert.equal(cached.json<{ content: { title: string } }>().content.title, "캐시 원고");
  assert.equal(refreshed.json<{ content: { title: string } }>().content.title, "최신 GitHub 원고");
  assert.equal(cached.json<{ freshness: { stale: boolean } }>().freshness.stale, false);
  assert.deepEqual(refreshed.json<{ freshness: { source: string; stale: boolean } }>().freshness.source, "github");
  assert.equal(refreshed.json<{ freshness: { source: string; stale: boolean } }>().freshness.stale, false);
  assert.equal(githubRequests, 1);
});

test("텍스트만 저장된 GitHub 캐시는 이미지 작업이 끝날 때까지 최신 원고를 다시 확인한다", async (context) => {
  const repository = new InMemoryAutomationRepository();
  await persistGitHubDraftDetail(repository, reviewDraft("405", "텍스트만 저장된 원고"));
  const latest = reviewDraft("405", "이미지까지 완성된 원고");
  latest.pipelineStatus = "CONTENT_READY";
  latest.imageGenerationStatus = "ready";
  latest.reviewStatus = "approved";
  latest.autoApproved = true;
  latest.state.reviewStatus = "approved";
  latest.state.autoApproved = true;
  latest.imageManifest = {
    schemaVersion: 1,
    status: "ready",
    generatedAt: latest.generatedAt,
    runId: latest.runId,
    sourceRevision: 1,
    styleProfileId: "insurance-editorial-v1",
    technicalQualityPassed: true,
    visualQualityPassed: true,
    humanReviewRequired: true,
    visualQuality: { overallPassed: true, summary: "통과", assets: [] },
    checks: [],
    assets: [{
      id: "hero",
      role: "hero",
      kind: "ai_generated",
      path: "hero.jpg",
      afterSection: 0,
      purpose: "concept",
      altText: "대표 이미지",
      width: 1200,
      height: 800,
      bytes: 1000,
      sha256: "abc",
    }],
  };
  let githubRequests = 0;
  const githubAutomation = {
    getDraft: async () => {
      githubRequests += 1;
      return latest;
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({
    system: createAutomationSystem({ repository }),
    githubAutomation,
    databaseProvider: "postgres",
  });
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/contents/405" });
  const body = response.json<{
    content: { state: string };
    versions: Array<{ metadata: { imagePackage?: { status?: string; assets?: unknown[] } } }>;
    freshness: { source: string };
  }>();

  assert.equal(response.statusCode, 200);
  assert.equal(body.content.state, "approved");
  assert.equal(body.versions.at(-1)?.metadata.imagePackage?.status, "ready");
  assert.equal(body.versions.at(-1)?.metadata.imagePackage?.assets?.length, 1);
  assert.equal(body.freshness.source, "github");
  assert.equal(githubRequests, 1);
});

test("GitHub 최근 원고 동기화 후 Neon의 전체 원고 목록을 보존한다", async (context) => {
  const repository = new InMemoryAutomationRepository();
  await persistGitHubDraftDetail(repository, reviewDraft("901", "이전 원고"));
  const latest = reviewDraft("902", "최근 원고");
  let synchronizedKnownIds: ReadonlySet<string> | null = null;
  const githubAutomation = {
    listDrafts: async (_limit: number, knownRunIds: ReadonlySet<string>) => {
      synchronizedKnownIds = knownRunIds;
      return [latest];
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({
    system: createAutomationSystem({ repository }),
    githubAutomation,
    databaseProvider: "postgres",
  });
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/contents?refresh=true" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{ items: Array<{ id: string }>; freshness: { source: string; stale: boolean } }>();
  assert.deepEqual(body.items.map((item) => item.id).sort(), ["901", "902"]);
  assert.equal(synchronizedKnownIds?.has("901"), false);
  assert.equal(body.freshness.source, "postgres-cache");
  assert.equal(body.freshness.stale, false);
});

test("이미 발행된 GitHub 원고는 다시 예약 상태로 되돌리지 않는다", async (context) => {
  const pending = reviewDraft("505");
  const publishedState: DashboardDraftState = {
    ...pending.state,
    reviewStatus: "approved",
    publicationStatus: "published",
    approvedAt: "2026-08-24T00:10:00.000Z",
    publishedAt: "2026-08-24T00:30:00.000Z",
  };
  const published = reviewDraft("505", "발행 완료 원고", publishedState);
  let updates = 0;
  const githubAutomation = {
    getDraft: async () => published,
    updateState: async () => { updates += 1; },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/contents/505/schedule",
    payload: { scheduledAt: "2026-08-25T07:00:00+09:00" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json<{ error: { code: string } }>().error.code, "CONTENT_NOT_SCHEDULABLE");
  assert.equal(updates, 0);
});

test("완성된 GitHub 원고는 별도 승인 없이 예약 알림을 저장한다", async (context) => {
  const draft = completedDraft("506", "완성 원고 예약 알림");
  let updatedState = draft.state;
  const githubAutomation = {
    getDraft: async () => draft,
    updateState: async (_runId: string, changes: Partial<DashboardDraftState>, actor: string) => {
      updatedState = changedState(draft, changes, actor);
      return updatedState;
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/contents/506/schedule",
    payload: { scheduledAt: "2026-08-25T07:00:00+09:00" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ content: { state: string } }>().content.state, "scheduled");
  assert.equal(updatedState.publicationStatus, "scheduled");
});

test("수동 발행 완료는 네이버 URL 없이도 기록할 수 있다", async (context) => {
  const draft = reviewDraft("507", "URL 없는 수동 발행", {
    ...reviewDraft("507").state,
    reviewStatus: "pending",
    publicationStatus: "scheduled",
    scheduledAt: "2026-08-25T07:00:00.000Z",
  });
  let updatedState = draft.state;
  const githubAutomation = {
    getDraft: async () => draft,
    updateState: async (_runId: string, changes: Partial<DashboardDraftState>, actor: string) => {
      updatedState = changedState(draft, changes, actor);
      return updatedState;
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({ method: "POST", url: "/api/contents/507/publish", payload: {} });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ content: { state: string }; publication: { externalUrl: string | null } }>().content.state, "published");
  assert.equal(updatedState.externalUrl, null);
});

test("동일 GitHub 원고의 승인·반려 경합은 한 요청만 성공한다", async (context) => {
  const draft = reviewDraft("606", "동시 검수 원고");
  let claimed = false;
  const githubAutomation = {
    getDraft: async () => draft,
    updateState: async (
      _runId: string,
      changes: Partial<DashboardDraftState>,
      actor: string,
    ) => {
      if (claimed) {
        throw new DomainError(
          "CONTENT_STATE_CONFLICT",
          "다른 검수 작업이 먼저 처리되었습니다. 최신 상태를 불러온 뒤 다시 확인해주세요.",
          409,
        );
      }
      claimed = true;
      await Promise.resolve();
      return changedState(draft, changes, actor);
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const [approved, rejected] = await Promise.all([
    app.inject({
      method: "POST",
      url: "/api/contents/606/approve",
      payload: { checks: { sources: true, advertising: true } },
    }),
    app.inject({
      method: "POST",
      url: "/api/contents/606/reject",
      payload: { reason: "동시에 들어온 반려 요청입니다." },
    }),
  ]);

  assert.deepEqual([approved.statusCode, rejected.statusCode].sort(), [200, 409]);
  const conflict = approved.statusCode === 409 ? approved : rejected;
  assert.equal(conflict.json<{ error: { code: string } }>().error.code, "CONTENT_STATE_CONFLICT");
});

test("말투 보정 또는 최신 품질 검사에 실패한 GitHub 원고는 승인하지 않는다", async (context) => {
  const toneFailed = reviewDraft("707", "말투 보정 실패 원고");
  toneFailed.toneSkillApplied = false;
  const factsFailed = reviewDraft("808", "사실 품질 실패 원고");
  factsFailed.article.factChecks = [];
  const drafts = new Map([["707", toneFailed], ["808", factsFailed]]);
  let updates = 0;
  const githubAutomation = {
    getDraft: async (runId: string) => drafts.get(runId)!,
    updateState: async () => { updates += 1; },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const toneResponse = await app.inject({
    method: "POST",
    url: "/api/contents/707/approve",
    payload: { checks: { sources: true, advertising: true } },
  });
  const factsResponse = await app.inject({
    method: "POST",
    url: "/api/contents/808/approve",
    payload: { checks: { sources: true, advertising: true } },
  });

  assert.equal(toneResponse.statusCode, 409);
  assert.equal(factsResponse.statusCode, 409);
  assert.equal(toneResponse.json<{ error: { code: string } }>().error.code, "CONTENT_QUALITY_FAILED");
  assert.equal(factsResponse.json<{ error: { code: string } }>().error.code, "CONTENT_QUALITY_FAILED");
  assert.deepEqual(toneResponse.json<{ error: { details: { failedCategories: string[] } } }>().error.details.failedCategories, ["tone"]);
  assert.deepEqual(factsResponse.json<{ error: { details: { failedCategories: string[] } } }>().error.details.failedCategories, ["facts"]);
  assert.equal(updates, 0);
});

test("원고 승인 시 이미지 생성을 시작하고 승인 원고는 다시 생성할 수 있다", async (context) => {
  let draft = reviewDraft("909", "이미지 생성 검증 원고");
  const dispatches: Array<{ workflow: string; inputs: Record<string, string> }> = [];
  const githubAutomation = {
    getDraft: async () => draft,
    updateState: async (
      _runId: string,
      changes: Partial<DashboardDraftState>,
      actor: string,
      currentState?: DashboardDraftState,
    ) => {
      assert.equal(currentState, draft.state);
      const state = changedState(draft, changes, actor);
      draft = reviewDraft(draft.runId, draft.title, state);
      return state;
    },
    dispatch: async (workflow: string, inputs: Record<string, string>) => {
      dispatches.push({ workflow, inputs });
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const approved = await app.inject({
    method: "POST",
    url: "/api/contents/909/approve",
    payload: { checks: { sources: true, advertising: true } },
  });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json<{ imagesQueued: boolean }>().imagesQueued, true);
  assert.deepEqual(dispatches[0], { workflow: "images", inputs: { run_id: "909" } });

  const regenerated = await app.inject({ method: "POST", url: "/api/contents/909/images/generate" });
  assert.equal(regenerated.statusCode, 202);
  assert.deepEqual(dispatches[1], { workflow: "images", inputs: { run_id: "909", force: "true" } });

  const editedImage = await app.inject({
    method: "POST",
    url: "/api/contents/909/images/generate",
    payload: { assetId: "visual-01", feedback: "배경을 더 밝게 하고 자동차가 잘 보이게 해주세요." },
  });
  assert.equal(editedImage.statusCode, 202);
  assert.deepEqual(dispatches[2], {
    workflow: "images",
    inputs: { run_id: "909", force: "true", asset_id: "visual-01", feedback: "배경을 더 밝게 하고 자동차가 잘 보이게 해주세요." },
  });
});
