import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../server/http/app.js";
import type { TrendSignal } from "../server/domain/types.js";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import { GitHubAutomationService } from "../server/services/github-automation.js";
import { createAutomationSystem } from "../server/system.js";
import { testSystem } from "./helpers.js";

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
  const capabilities = response.json<{ integrations: { database: { configured: boolean; provider: string } } }>();
  assert.deepEqual(capabilities.integrations.database, { configured: true, provider: "github-contents" });
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
