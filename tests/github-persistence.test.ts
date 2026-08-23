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
    updatedAt: "2026-08-23T22:11:00.000Z",
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
      approvedBy: "reviewer",
      rejectedBy: null,
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

test("GitHub 승인과 반려 이력을 서로 다른 감사 기록으로 보존한다", async () => {
  const repository = new InMemoryAutomationRepository();
  await persistGitHubDraftDetail(repository, draft());

  const rejected = draft();
  rejected.reviewStatus = "rejected";
  rejected.publicationStatus = "none";
  rejected.scheduledAt = null;
  rejected.state.reviewStatus = "rejected";
  rejected.state.publicationStatus = "none";
  rejected.state.checks = { sources: false, advertising: false };
  rejected.state.reason = "출처를 다시 확인해주세요.";
  rejected.state.approvedBy = null;
  rejected.state.rejectedBy = "reviewer-2";
  rejected.state.approvedAt = null;
  rejected.state.rejectedAt = "2026-08-23T22:20:00.000Z";
  rejected.state.scheduledAt = null;
  rejected.state.updatedAt = "2026-08-23T22:20:00.000Z";
  rejected.updatedAt = rejected.state.updatedAt;
  await persistGitHubDraftDetail(repository, rejected);

  const detail = await repository.getContentDetail("321");
  assert.ok(detail);
  assert.equal(detail.approvals.length, 2);
  assert.equal(detail.auditEvents.length, 2);
  assert.deepEqual(detail.approvals.map((approval) => approval.decision), ["approved", "rejected"]);
});

test("예약과 발행 상태 변경이 승인 이력을 중복 생성하지 않는다", async () => {
  const repository = new InMemoryAutomationRepository();
  await persistGitHubDraftDetail(repository, draft());

  const published = draft();
  published.publicationStatus = "published";
  published.publishedAt = "2026-08-24T01:00:00.000Z";
  published.updatedAt = "2026-08-24T01:00:01.000Z";
  published.state.publicationStatus = "published";
  published.state.publishedAt = published.publishedAt;
  published.state.externalUrl = "https://blog.naver.com/example/321";
  published.state.updatedAt = published.updatedAt;
  await persistGitHubDraftDetail(repository, published);

  const detail = await repository.getContentDetail("321");
  assert.ok(detail);
  assert.equal(detail.content.state, "published");
  assert.equal(detail.content.updatedAt, published.updatedAt);
  assert.equal(detail.approvals.length, 1);
  assert.equal(detail.approvals[0]?.actorId, "reviewer");
  assert.equal(detail.auditEvents.length, 2);
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

test("100을 넘는 내부 후보 점수를 순위를 유지하며 저장 범위로 환산한다", async () => {
  const repository = new InMemoryAutomationRepository();
  await persistGitHubTrends(repository, {
    collectedAt: generatedAt,
    items: [
      { title: "반복 노출 1위", link: "https://blog.naver.com/example/1", postdate: "20260823", candidateScore: 190, matchedQueries: ["보험"] },
      { title: "반복 노출 2위", link: "https://blog.naver.com/example/2", postdate: "20260823", candidateScore: 110, matchedQueries: ["보험"] },
    ],
  });

  const trends = await repository.listTrendSignals();
  assert.equal(trends[0]?.engagementScore, 100);
  assert.ok((trends[1]?.engagementScore ?? 0) < 100);
  assert.ok((trends[1]?.engagementScore ?? 0) > 0);
});
