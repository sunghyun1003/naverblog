import assert from "node:assert/strict";
import test from "node:test";
import type { Actor } from "../server/domain/types.js";
import { testSystem } from "./helpers.js";

const admin: Actor = { id: "admin-1", roles: ["admin"] };

test("전체 콘텐츠 자동화 파이프라인이 검토 대기까지 실행된다", async () => {
  const system = testSystem();
  const content = await system.contentService.create(
    {
      title: "보험 가입 전 고지의무, 어디까지 알려야 할까?",
      topic: "보험 고지의무",
      strategy: "trend",
      idempotencyKey: "content-1",
    },
    admin,
  );

  const job = await system.contentService.runPipeline(content.id, "pipeline-1", admin);
  const detail = await system.contentService.detail(content.id);

  assert.equal(job.status, "succeeded");
  assert.equal(job.steps.length, 9);
  assert.equal(job.steps.every((step) => step.status === "succeeded"), true);
  assert.equal(detail.content.state, "review_ready");
  assert.deepEqual(detail.versions.map((version) => version.stage), ["brief", "draft", "seo", "geo", "human_tone"]);
  assert.equal(detail.sources.length, 3);
  assert.equal(detail.claims.length, 3);
  assert.equal(detail.qualityResults.length, 5);
  assert.equal(detail.qualityResults.some((result) => result.category === "advertising" && result.status === "warning"), true);
  assert.equal(detail.auditEvents.some((event) => event.action === "pipeline.succeeded"), true);
});

test("동일 멱등성 키는 파이프라인을 중복 실행하지 않는다", async () => {
  const system = testSystem();
  const content = await system.contentService.create(
    { title: "자동차보험 갱신 전 확인할 것", topic: "자동차보험 갱신", strategy: "trend", idempotencyKey: "content-2" },
    admin,
  );
  const first = await system.contentService.runPipeline(content.id, "same-pipeline-key", admin);
  const second = await system.contentService.runPipeline(content.id, "same-pipeline-key", admin);
  assert.equal(first.id, second.id);
  assert.equal((await system.repository.listJobs(content.id)).length, 1);
  assert.equal((await system.repository.listVersions(content.id)).length, 5);
});

test("승인 확인, 예약, 발행 권한과 상태 전이가 이어진다", async () => {
  const system = testSystem();
  const content = await system.contentService.create(
    { title: "보험금 청구 전에 준비할 서류", topic: "보험금 청구 서류", strategy: "original", idempotencyKey: "content-3" },
    admin,
  );
  await system.contentService.runPipeline(content.id, "pipeline-3", admin);
  await assert.rejects(
    system.contentService.approve(content.id, { sources: true, advertising: false }, admin),
    (error: unknown) => error instanceof Error && error.message.includes("모두 확인"),
  );
  const approved = await system.contentService.approve(content.id, { sources: true, advertising: true }, admin);
  assert.equal(approved.state, "approved");
  const scheduled = await system.contentService.schedule(content.id, "2026-08-20T00:00:00.000Z", admin);
  assert.equal(scheduled.content.state, "scheduled");
  assert.equal(scheduled.publication.status, "scheduled");
  const published = await system.contentService.publish(content.id, admin);
  assert.equal(published.content.state, "published");
  assert.equal(published.publication.status, "published");
  assert.match(published.publication.externalUrl ?? "", /^https:\/\//);
});
