import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import type { AutomationDraftDetail } from "../server/services/github-automation.js";
import { persistGitHubDraftDetail, persistGitHubTrends } from "../server/services/github-persistence.js";

const generatedAt = "2026-08-23T22:00:00.000Z";

function draft(): AutomationDraftDetail {
  return {
    runId: "321",
    title: "실손보험 전환 체크리스트",
    topic: "실손보험 전환",
    primaryKeyword: "실손보험 전환",
    generatedAt,
    pipelineStatus: "TONE_REVIEW_COMPLETE",
    toneSkillApplied: true,
    reviewStatus: "approved",
    publicationStatus: "scheduled",
    scheduledAt: "2026-08-24T00:00:00.000Z",
    publishedAt: null,
    articleMarkdown: "# 실손보험 전환 체크리스트",
    copyPackage: "복사용 원고",
    sourcesMarkdown: "- 출처",
    article: {
      planning: { topic: "실손보험 전환" },
      seo: { primaryKeyword: "실손보험 전환" },
      article: { title: "실손보험 전환 체크리스트" },
      factChecks: [{ claim: "약관 확인이 필요하다", status: "NEEDS_REVIEW", verificationNote: "사람이 확인한다." }],
      sources: [{ title: "참고 글", url: "https://blog.naver.com/example/1" }],
    },
    state: {
      schemaVersion: 1,
      runId: "321",
      reviewStatus: "approved",
      publicationStatus: "scheduled",
      checks: { sources: true, advertising: true },
      reason: null,
      approvedAt: "2026-08-23T22:10:00.000Z",
      rejectedAt: null,
      scheduledAt: "2026-08-24T00:00:00.000Z",
      publishedAt: null,
      externalUrl: null,
      updatedAt: "2026-08-23T22:11:00.000Z",
      updatedBy: "carrot",
    },
  };
}

test("GitHub 원고를 영속 저장소에 중복 없이 동기화한다", async () => {
  const repository = new InMemoryAutomationRepository();
  await persistGitHubDraftDetail(repository, draft());
  await persistGitHubDraftDetail(repository, draft());

  const detail = await repository.getContentDetail("321");
  assert.ok(detail);
  assert.equal(detail.content.state, "scheduled");
  assert.equal(detail.versions.length, 1);
  assert.equal(detail.sources.length, 1);
  assert.equal(detail.claims.length, 1);
  assert.equal(detail.jobs.length, 1);
  assert.equal(detail.qualityResults.length, 5);
  assert.equal(detail.approvals.length, 1);
  assert.equal(detail.publications.length, 1);
  assert.equal(detail.auditEvents.length, 1);
});

test("GitHub 트렌드 스냅샷을 PostgreSQL 도메인 형식으로 변환한다", async () => {
  const repository = new InMemoryAutomationRepository();
  await persistGitHubTrends(repository, {
    collectedAt: generatedAt,
    items: [{
      title: "실손보험 글",
      link: "https://blog.naver.com/example/1",
      postdate: "20260823",
      candidateScore: 88,
      matchedQueries: ["실손보험"],
    }],
  });

  const trends = await repository.listTrendSignals();
  assert.equal(trends.length, 1);
  assert.equal(trends[0]?.publishedAt, "2026-08-23T00:00:00.000Z");
  assert.equal(trends[0]?.topicKey, "실손보험");
});
