import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import type { AutomationDraftDetail } from "../server/services/github-automation.js";
import { draftToDetail } from "../server/services/github-content-mapper.js";
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
    toneVerdict: "PASS",
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
      article: {
        title: "실손보험 전환 체크리스트",
        visualPlan: [{ afterSection: 2, purpose: "comparison", brief: "두 조건을 표로 비교", altText: "보험 조건 비교표" }],
      },
      factChecks: [{ claim: "약관 확인이 필요하다", status: "NEEDS_REVIEW", verificationNote: "사람이 확인한다." }],
      sources: [{ title: "참고 글", url: "https://blog.naver.com/example/1" }],
    },
    discoveryQuality: {
      schemaVersion: 1,
      checkedAt: generatedAt,
      seo: {
        score: 88,
        status: "passed",
        checks: [
          { id: "title", label: "제목 길이와 키워드", points: 20, critical: true, passed: true, detail: "제목 기준 통과" },
          { id: "frequency", label: "키워드 반복 밀도", points: 15, critical: false, passed: true, detail: "정확 일치 2회" },
        ],
      },
      geo: {
        score: 76,
        status: "warning",
        checks: [
          { id: "direct", label: "첫 화면 직접 답변", points: 20, critical: true, passed: true, detail: "2문장" },
          { id: "faq", label: "추가 질문 FAQ", points: 15, critical: false, passed: false, detail: "FAQ 2개" },
        ],
      },
    },
    advertisingQuality: {
      schemaVersion: 1,
      checkedAt: generatedAt,
      status: "warning",
      score: 92,
      automatedCheckPassed: true,
      humanReviewRequired: true,
      summary: "자동 점검 위험 1건을 확인한 뒤 사람이 최종 승인해야 합니다.",
      risks: [{
        id: "direct_solicitation",
        label: "직접 가입·상담 유도",
        severity: "high",
        penalty: 8,
        excerpts: ["가입 신청"],
        guidance: "정보 제공 글과 영업성 행동 유도를 분리하세요.",
      }],
      notice: "자동 사전 점검이며 보험 광고 심의 통과를 의미하지 않습니다.",
    },
    editorialQuality: {
      schemaVersion: 1,
      checkedAt: generatedAt,
      score: 100,
      status: "passed",
      checks: [{ id: "format_variety", label: "전개 형식 다양성", points: 15, critical: true, passed: true, detail: "서로 다른 전개 형식 4종" }],
    },
    toneReview: {
      verdict: "PASS",
      summary: "반복 표현을 줄여 자연스러운 정보형 문장으로 정리했습니다.",
      issues: [],
      rewriteInstructions: [],
    },
    toneAttempts: {
      schemaVersion: 1,
      completedAt: generatedAt,
      maxRewriteAttempts: 2,
      rewriteAttemptsPerformed: 1,
      finalVerdict: "PASS",
      latestVerdict: "PASS",
      selectedReviewIndex: 1,
      selectedScore: 0,
      exhausted: false,
      attempts: [],
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
  assert.equal(detail.qualityResults.length, 7);
  assert.equal(detail.approvals.length, 1);
  assert.equal(detail.publications.length, 1);
  assert.equal(detail.auditEvents.length, 1);
});

test("자동 완성 원고를 직접 수정하면 다시 검토 대기 상태가 된다", () => {
  const input = draft();
  input.pipelineStatus = "CONTENT_READY";
  input.reviewStatus = "pending";
  input.publicationStatus = "none";
  input.scheduledAt = null;
  input.autoApproved = false;
  input.state.reviewStatus = "pending";
  input.state.publicationStatus = "none";
  input.state.scheduledAt = null;
  input.state.autoApproved = false;
  input.state.manualEdit = {
    title: "직접 수정한 제목",
    body: "직접 수정한 본문입니다.",
    reason: null,
    createdAt: generatedAt,
    createdBy: "carrot",
    baseRevision: 1,
  };

  const detail = draftToDetail(input);
  assert.equal(detail.content.state, "review_ready");
  assert.equal(detail.automation?.autoApproved, false);
  assert.equal(detail.automation?.manualEdit, true);
});

test("반려 재작성 전후 버전과 반려 이력을 함께 보존한다", () => {
  const input = draft();
  input.reviewStatus = "pending";
  input.publicationStatus = "none";
  input.scheduledAt = null;
  input.revision = 2;
  input.rewriteStatus = "completed";
  input.title = "수정된 원고";
  input.articleMarkdown = "# 수정된 원고";
  input.copyPackage = "수정된 복사본";
  input.revisions = [{
    revision: 1,
    title: "초기 원고",
    articleMarkdown: "# 초기 원고",
    copyPackage: "초기 복사본",
    createdAt: generatedAt,
  }];
  input.state.reviewStatus = "pending";
  input.state.publicationStatus = "none";
  input.state.scheduledAt = null;
  input.state.revision = 2;
  input.state.rewriteStatus = "completed";
  input.state.rewrittenAt = "2026-08-24T01:00:00.000Z";
  input.state.decisionHistory = [{
    decision: "rejected",
    reason: "구체적인 사례를 추가해주세요.",
    actorId: "carrot",
    createdAt: "2026-08-24T00:30:00.000Z",
    revision: 1,
  }];

  const detail = draftToDetail(input);
  assert.equal(detail.content.rewriteStatus, "completed");
  assert.deepEqual(detail.versions.map((version) => version.sequence), [1, 2]);
  assert.deepEqual(detail.versions.map((version) => version.title), ["초기 원고", "수정된 원고"]);
  assert.equal(detail.qualityResults.every((result) => result.id.includes(":quality:2:")), true);
  assert.equal(detail.approvals.length, 1);
  assert.equal(detail.approvals[0]?.decision, "rejected");
  assert.equal(detail.approvals[0]?.versionId, "321:human-tone");
});

test("출처가 없는 사실 검증 항목에는 실제 placeholder 출처를 연결한다", () => {
  const input = draft();
  input.article.sources = [];
  input.article.factChecks = [
    { claim: "첫 번째 주장", status: "NEEDS_REVIEW" },
    { claim: "두 번째 주장", status: "NEEDS_REVIEW" },
  ];

  const detail = draftToDetail(input);
  const sourceIds = new Set(detail.sources.map((source) => source.id));

  assert.equal(detail.sources.length, 1);
  assert.match(detail.sources[0]!.url, /^urn:github-draft:/);
  assert.equal(detail.claims.length, 2);
  assert.equal(detail.claims.every((claim) => sourceIds.has(claim.sourceId)), true);
});

test("말투 재작성 후에도 이슈가 남은 원고는 승인 대기가 아니라 작성중으로 보존한다", () => {
  const input = draft();
  input.pipelineStatus = "TONE_REVIEW_REQUIRED";
  input.toneVerdict = "REWRITE_REQUIRED";
  input.reviewStatus = "pending";
  input.publicationStatus = "none";
  input.scheduledAt = null;
  input.state.reviewStatus = "pending";
  input.state.publicationStatus = "none";
  input.state.scheduledAt = null;

  const detail = draftToDetail(input);
  const toneQuality = detail.qualityResults.find((result) => result.category === "tone");
  const toneStep = detail.jobs[0]?.steps.find((step) => step.stage === "humanize_tone");

  assert.equal(detail.content.state, "drafting");
  assert.equal(toneQuality?.status, "failed");
  assert.equal(toneStep?.status, "failed");
  assert.equal(detail.jobs[0]?.status, "failed");
});

test("SEO·GEO 검수는 고정 점수가 아니라 자동화 레포의 실제 검사 결과를 사용한다", () => {
  const detail = draftToDetail(draft());
  const seo = detail.qualityResults.find((result) => result.category === "seo");
  const geo = detail.qualityResults.find((result) => result.category === "geo");

  assert.equal(seo?.score, 88);
  assert.equal(seo?.status, "passed");
  assert.match(seo?.messages[0] ?? "", /2개 기준을 모두 통과/);
  assert.equal(geo?.score, 76);
  assert.equal(geo?.status, "warning");
  assert.match(geo?.messages[0] ?? "", /추가 질문 FAQ/);
});

test("중복·빈 URL 출처를 정규화하고 모든 주장에 저장 가능한 출처를 연결한다", () => {
  const input = draft();
  input.article.sources = [
    { title: "중복 출처 A", url: "https://blog.naver.com/example/duplicate" },
    { title: "중복 출처 B", url: "https://blog.naver.com/example/duplicate/" },
    { title: "주소 없는 출처", url: "" },
  ];
  input.article.factChecks = [
    { claim: "첫 번째 주장" },
    { claim: "두 번째 주장" },
    { claim: "세 번째 주장" },
    { claim: "네 번째 주장" },
  ];

  const detail = draftToDetail(input);
  const sourceIds = new Set(detail.sources.map((source) => source.id));
  const sourceUrls = detail.sources.map((source) => source.url);

  assert.equal(detail.sources.length, 2);
  assert.equal(new Set(sourceUrls).size, sourceUrls.length);
  assert.equal(sourceUrls.every(Boolean), true);
  assert.equal(detail.claims.every((claim) => sourceIds.has(claim.sourceId)), true);
  assert.equal(detail.claims[0]!.sourceId, detail.claims[1]!.sourceId);
});

test("공식 근거 패키지를 출처·주장·원고 버전 메타데이터에 연결한다", () => {
  const input = draft();
  input.article.sources = [
    { title: "자동차손해배상 보장법", url: "https://www.law.go.kr/example", sourceType: "OFFICIAL", evidenceIds: ["E1"] },
    { title: "참고 블로그", url: "https://blog.naver.com/example/1", sourceType: "TREND_REFERENCE", evidenceIds: [] },
  ];
  input.article.factChecks = [{
    claim: "자동차보유자는 의무보험에 가입해야 한다.",
    status: "GENERAL_GUIDANCE",
    verificationNote: "법령 원문 확인",
    evidenceIds: ["E1"],
    verificationStatus: "SUPPORTED",
  }];
  input.evidencePackage = {
    schemaVersion: 1,
    topic: "자동차보험 갱신",
    contentBrief: {
      primaryIntent: "정보탐색형",
      secondaryIntent: "비교형",
      audienceMoment: "갱신 직전",
      readerProblem: "무엇을 확인할지 모른다.",
      contentPromise: "확인 순서를 알 수 있다.",
      differentiation: "가격 대신 조건을 비교한다.",
      outlineLogic: ["기간", "운전자", "담보", "최종 조건"],
      prohibitedAngles: ["최저가 보장", "특정 상품 권유"],
    },
    researchQuestions: [{ id: "Q1", question: "가입 의무는 무엇인가?", claimType: "law_or_regulation", whyNeeded: "법적 기준" }],
    sources: [{
      id: "S1",
      institution: "국가법령정보센터",
      authorityTier: 1,
      sourceType: "law",
      title: "자동차손해배상 보장법",
      url: "https://www.law.go.kr/example",
      publishedOrEffectiveDate: "2025-10-01",
      supportSummary: "의무보험 가입 범위를 규정한다.",
    }],
    claims: [{
      id: "E1",
      claim: "자동차보유자는 의무보험에 가입해야 한다.",
      claimType: "law_or_regulation",
      sourceIds: ["S1"],
      verificationStatus: "SUPPORTED",
      scopeNote: "구체적인 금액은 시행령을 추가 확인한다.",
    }],
    gaps: [{ questionId: "Q1", reason: "과태료 금액은 확인하지 않았다.", draftHandling: "omit" }],
  };

  const detail = draftToDetail(input);
  const officialSource = detail.sources.find((source) => source.sourceType === "official");
  const factQuality = detail.qualityResults.find((result) => result.category === "facts");
  const evidenceReview = detail.versions.at(-1)?.metadata.evidenceReview as { claims?: unknown[] } | undefined;

  assert.equal(officialSource?.organization, "국가법령정보센터");
  assert.equal(officialSource?.trustGrade, "A");
  assert.equal(detail.claims[0]?.sourceId, officialSource?.id);
  assert.equal(detail.claims[0]?.verificationStatus, "verified");
  assert.match(detail.claims[0]?.evidenceLocator ?? "", /E1/);
  assert.equal(evidenceReview?.claims?.length, 1);
  assert.equal(factQuality?.status, "warning");
  assert.match(factQuality?.messages[0] ?? "", /추가 확인 1개/);
});

test("같은 공식 URL을 공유하는 근거 ID도 하나의 저장 출처에 안전하게 연결한다", () => {
  const input = draft();
  input.article.sources = [];
  input.article.factChecks = [{
    claim: "두 기관 자료가 같은 공식 원문을 가리킨다.",
    evidenceIds: ["E2"],
    verificationStatus: "CROSS_VERIFIED",
  }];
  input.evidencePackage = {
    schemaVersion: 1,
    topic: "중복 원문 검증",
    contentBrief: {
      primaryIntent: "정보탐색형",
      secondaryIntent: "비교형",
      audienceMoment: "갱신 직전",
      readerProblem: "공식 기준을 확인하기 어렵다.",
      contentPromise: "원문 기준을 확인할 수 있다.",
      differentiation: "공식 자료만 사용한다.",
      outlineLogic: ["원문 확인"],
      prohibitedAngles: [],
    },
    researchQuestions: [],
    sources: [
      { id: "S1", institution: "기관 A", authorityTier: 1, sourceType: "law", title: "공식 원문", url: "https://example.com/source", publishedOrEffectiveDate: null, supportSummary: "기준 확인" },
      { id: "S2", institution: "기관 B", authorityTier: 2, sourceType: "comparison", title: "공식 원문", url: "https://example.com/source/", publishedOrEffectiveDate: null, supportSummary: "교차 확인" },
    ],
    claims: [{ id: "E2", claim: "두 기관 자료가 같은 공식 원문을 가리킨다.", claimType: "official_guidance", sourceIds: ["S2"], verificationStatus: "CROSS_VERIFIED", scopeNote: "" }],
    gaps: [],
  };

  const detail = draftToDetail(input);

  assert.equal(detail.sources.length, 1);
  assert.equal(detail.claims[0]?.sourceId, detail.sources[0]?.id);
  assert.equal(detail.claims[0]?.verificationStatus, "verified");
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

test("내부 후보 점수는 관련성으로 환산하고 미제공 참여도는 0으로 저장한다", async () => {
  const repository = new InMemoryAutomationRepository();
  await persistGitHubTrends(repository, {
    collectedAt: generatedAt,
    items: [
      { title: "반복 노출 1위", link: "https://blog.naver.com/example/1", postdate: "20260823", candidateScore: 190, matchedQueries: ["보험"] },
      { title: "반복 노출 2위", link: "https://blog.naver.com/example/2", postdate: "20260823", candidateScore: 110, matchedQueries: ["보험"] },
    ],
  });

  const trends = await repository.listTrendSignals();
  assert.equal(trends[0]?.engagementScore, 0);
  assert.equal(trends[0]?.relevanceScore, 100);
  assert.ok((trends[1]?.relevanceScore ?? 0) < 100);
  assert.ok((trends[1]?.relevanceScore ?? 0) > 0);
});

test("보험 광고 검사는 고정 점수 대신 자동 사전 점검 결과를 사용한다", () => {
  const detail = draftToDetail(draft());
  const advertising = detail.qualityResults.find((result) => result.category === "advertising");

  assert.equal(advertising?.score, 92);
  assert.equal(advertising?.status, "warning");
  assert.match(advertising?.messages[0] ?? "", /직접 가입·상담 유도/);
  assert.match(advertising?.messages[0] ?? "", /심의 통과를 의미하지 않습니다/);
});

test("사람 말투 검사는 실제 재작성 횟수와 최종 피드백을 표시한다", () => {
  const detail = draftToDetail(draft());
  const tone = detail.qualityResults.find((result) => result.category === "tone");
  const metadata = detail.versions.at(-1)?.metadata;

  assert.equal(tone?.status, "passed");
  assert.match(tone?.messages[0] ?? "", /자동 재작성 1회/);
  assert.match(tone?.messages[0] ?? "", /반복 표현을 줄여/);
  assert.equal((metadata?.toneAttempts as { selectedReviewIndex?: number })?.selectedReviewIndex, 1);
  assert.deepEqual(metadata?.visualPlan, [{ afterSection: 2, purpose: "comparison", brief: "두 조건을 표로 비교", altText: "보험 조건 비교표" }]);
});
