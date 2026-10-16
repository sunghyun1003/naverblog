import assert from "node:assert/strict";
import test from "node:test";
import type { Actor } from "../server/domain/types.js";
import { testSystem } from "./helpers.js";

const admin: Actor = { id: "admin-1", roles: ["admin"] };

test("발행 예정은 해제·변경·삭제 가능하고 수동 발행 기록은 게시 어댑터를 호출하지 않는다", async () => {
  const system = testSystem();
  system.adapters.publisher.prepare = async () => { throw new Error("automatic publisher must not be used"); };
  system.adapters.publisher.publish = async () => { throw new Error("automatic publisher must not be used"); };
  const make = async (key: string) => {
    const content = await system.contentService.create({ title: "테스트 완성 원고", topic: "보험", strategy: "original", idempotencyKey: key }, admin);
    await system.contentService.runPipeline(content.id, key, admin);
    return content;
  };
  const first = await make("manual-publication");
  await system.contentService.schedule(first.id, "2026-10-20T00:00:00.000Z", admin);
  await system.contentService.schedule(first.id, "2026-10-21T00:00:00.000Z", admin);
  const cancelled = await system.contentService.cancelSchedule(first.id, admin);
  assert.equal(cancelled.state, "review_ready");
  assert.equal(cancelled.scheduledAt, null);
  assert.equal((await system.repository.listPublications(first.id)).some(item => item.status === "scheduled"), false);
  const published = await system.contentService.publish(first.id, admin);
  assert.equal(published.publication.externalUrl, null);
  await assert.rejects(system.contentService.cancelSchedule(first.id, admin));
  const second = await make("scheduled-deletion");
  await system.contentService.schedule(second.id, "2026-10-20T00:00:00.000Z", admin);
  await system.contentService.delete(second.id, admin);
  assert.equal(await system.repository.getContent(second.id), null);
  assert.deepEqual(await system.repository.listPublications(second.id), []);
});

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
  assert.equal(detail.qualityResults.length, 6);
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
  assert.equal(published.publication.externalUrl, null);
});
