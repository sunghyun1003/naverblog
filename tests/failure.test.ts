import assert from "node:assert/strict";
import test from "node:test";
import type { Actor } from "../server/domain/types.js";
import { testSystem } from "./helpers.js";

const admin: Actor = { id: "admin-1", roles: ["admin"] };

test("말투 보정이 보호 문구를 바꾸면 작업만 실패하고 콘텐츠 이력은 보존한다", async () => {
  const system = testSystem();
  system.adapters.humanToneRunner = {
    async run(document) {
      return {
        ...document,
        body: document.body.replaceAll("약관", "안내문"),
        changedProtectedTerms: ["약관"],
        diffSummary: ["보호 문구 변경"],
        skillName: "unsafe-test-skill",
        skillVersion: "0.0.0",
      };
    },
  };
  const content = await system.contentService.create(
    { title: "보험 약관 확인 방법 알아보기", topic: "보험 약관", strategy: "original", idempotencyKey: "failure-content-1" },
    admin,
  );

  await assert.rejects(
    system.contentService.runPipeline(content.id, "failure-pipeline-1", admin),
    (error: unknown) => error instanceof Error && error.message.includes("보호 문구"),
  );
  const detail = await system.contentService.detail(content.id);
  assert.equal(detail.content.state, "drafting");
  assert.equal(detail.jobs[0]?.status, "failed");
  assert.equal(detail.jobs[0]?.steps.find((step) => step.stage === "humanize_tone")?.status, "failed");
  assert.deepEqual(detail.versions.map((version) => version.stage), ["brief", "draft", "seo", "geo"]);
  assert.equal(detail.auditEvents.some((event) => event.action === "pipeline.failed"), true);
});

test("동일 생성 키는 콘텐츠를 중복 생성하지 않는다", async () => {
  const system = testSystem();
  const input = { title: "여행자보험 보장 확인하기", topic: "여행자보험", strategy: "trend" as const, idempotencyKey: "same-create-key" };
  const first = await system.contentService.create(input, admin);
  const second = await system.contentService.create(input, admin);
  assert.equal(first.id, second.id);
  assert.equal((await system.contentService.list()).length, 1);
});
