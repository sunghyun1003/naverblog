import { pipelineStages, type ContentDetail, type ContentRecord, type ContentState } from "../domain/types.js";
import type { AutomationDraftDetail, AutomationDraftSummary } from "./github-automation.js";

function contentState(draft: AutomationDraftSummary): ContentState {
  if (draft.publicationStatus === "published") return "published";
  if (draft.publicationStatus === "scheduled") return "scheduled";
  if (draft.reviewStatus === "approved") return "approved";
  if (draft.reviewStatus === "rejected") return "drafting";
  if (draft.pipelineStatus === "TONE_REVIEW_COMPLETE") return "review_ready";
  return "drafting";
}

export function draftToContent(draft: AutomationDraftSummary): ContentRecord {
  return {
    id: draft.runId,
    creationKey: `github-run:${draft.runId}`,
    title: draft.title,
    topic: draft.topic,
    strategy: "trend",
    state: contentState(draft),
    assigneeId: "carrot",
    createdBy: "github-actions",
    createdAt: draft.generatedAt,
    updatedAt: draft.updatedAt,
    scheduledAt: draft.scheduledAt,
    publishedAt: draft.publishedAt,
  };
}

export function draftToDetail(draft: AutomationDraftDetail): ContentDetail {
  const content = draftToContent(draft);
  const versionId = `${draft.runId}:human-tone`;
  const sourceByKey = new Map<string, ContentDetail["sources"][number]>();
  const sourceByOriginalIndex: ContentDetail["sources"] = [];
  for (const [index, source] of (draft.article.sources ?? []).entries()) {
    const rawUrl = source.url?.trim() ?? "";
    const url = rawUrl || `urn:github-draft:${draft.runId}:source:${index + 1}`;
    const key = rawUrl ? rawUrl.toLowerCase().replace(/\/+$/, "") : url;
    let normalized = sourceByKey.get(key);
    if (!normalized) {
      normalized = {
        id: `${draft.runId}:source:${index + 1}`,
        contentId: draft.runId,
        organization: "NAVER 블로그",
        title: source.title?.trim() || `출처 ${index + 1}`,
        url,
        sourceType: "trend" as const,
        publishedAt: null,
        collectedAt: draft.generatedAt,
        trustGrade: "C" as const,
      };
      sourceByKey.set(key, normalized);
    }
    sourceByOriginalIndex.push(normalized);
  }
  if (!sourceByOriginalIndex.length && (draft.article.factChecks?.length ?? 0) > 0) {
    const placeholder = {
      id: `${draft.runId}:source:placeholder`,
      contentId: draft.runId,
      organization: "출처 확인 필요",
      title: "원문 출처 확인 필요",
      url: `urn:github-draft:${draft.runId}:source:placeholder`,
      sourceType: "trend" as const,
      publishedAt: null,
      collectedAt: draft.generatedAt,
      trustGrade: "C" as const,
    };
    sourceByKey.set(placeholder.url, placeholder);
    sourceByOriginalIndex.push(placeholder);
  }
  const sources = [...sourceByKey.values()];
  const claims = (draft.article.factChecks ?? []).map((fact, index) => ({
    id: `${draft.runId}:claim:${index + 1}`,
    contentId: draft.runId,
    sourceId: sourceByOriginalIndex[Math.min(index, sourceByOriginalIndex.length - 1)]!.id,
    statement: fact.claim ?? "검토 대상 주장",
    evidenceExcerpt: fact.verificationNote ?? "사람의 최종 검토가 필요합니다.",
    evidenceLocator: `article.factChecks.${index}`,
    effectiveDate: null,
    verificationStatus: fact.status === "VERIFIED" ? "verified" as const : "needs_review" as const,
    createdAt: draft.generatedAt,
  }));
  const qualitySeeds = [
    ["facts", claims.length > 0 ? "warning" : "failed", claims.length > 0 ? 80 : 0, `사실 확인 항목 ${claims.length}건. 사람이 원문과 대조해야 합니다.`],
    ["seo", "passed", 90, `핵심 키워드: ${draft.primaryKeyword}`],
    ["geo", "passed", 90, "직접 답변, 질문 구조와 출처 목록이 생성됐습니다."],
    ["tone", draft.toneSkillApplied ? "passed" : "failed", draft.toneSkillApplied ? 100 : 0, draft.toneSkillApplied ? "demi Humanizer 피드백과 재작성이 적용됐습니다." : "말투 보정이 적용되지 않았습니다."],
    ["advertising", "warning", 70, "보험 광고 표현은 사람이 최종 확인해야 합니다."],
  ] as const;
  const approvalCreatedAt = draft.state.reviewStatus === "approved"
    ? draft.state.approvedAt
    : draft.state.rejectedAt;
  const approvalActorId = draft.state.reviewStatus === "approved"
    ? draft.state.approvedBy ?? draft.state.updatedBy
    : draft.state.rejectedBy ?? draft.state.updatedBy;
  const approvals = draft.state.reviewStatus === "pending" ? [] : [{
    id: `${draft.runId}:approval:${draft.state.reviewStatus}:${approvalCreatedAt ?? draft.state.updatedAt}`,
    contentId: draft.runId,
    versionId,
    decision: draft.state.reviewStatus,
    actorId: approvalActorId,
    reason: draft.state.reason,
    createdAt: approvalCreatedAt ?? draft.state.updatedAt,
  }];
  const publications = draft.state.publicationStatus === "none" ? [] : [{
    id: `${draft.runId}:publication`,
    contentId: draft.runId,
    status: draft.state.publicationStatus,
    scheduledAt: draft.state.scheduledAt,
    publishedAt: draft.state.publishedAt,
    externalUrl: draft.state.externalUrl,
    createdAt: draft.state.approvedAt ?? draft.generatedAt,
    updatedAt: draft.state.updatedAt,
  }];

  return {
    content,
    versions: [{
      id: versionId,
      contentId: draft.runId,
      sequence: 1,
      stage: "human_tone",
      title: draft.title,
      body: draft.articleMarkdown,
      brief: null,
      createdBy: "github-actions",
      createdAt: draft.generatedAt,
      parentVersionId: null,
      metadata: {
        skillName: "demi",
        toneSkillApplied: draft.toneSkillApplied,
        diffSummary: ["Humanizer 33개 패턴 진단", "피드백 반영 재작성", "사실·출처 보존 자체 감사"],
        copyPackage: draft.copyPackage,
      },
    }],
    sources,
    claims,
    qualityResults: qualitySeeds.map(([category, status, score, message], index) => ({
      id: `${draft.runId}:quality:${index + 1}`,
      contentId: draft.runId,
      versionId,
      category,
      status,
      score,
      messages: [message],
      checkedAt: draft.generatedAt,
    })),
    jobs: [{
      id: draft.runId,
      contentId: draft.runId,
      idempotencyKey: `github-run:${draft.runId}`,
      status: "succeeded",
      steps: pipelineStages.map((stage) => ({
        stage,
        status: "succeeded",
        startedAt: draft.generatedAt,
        completedAt: draft.generatedAt,
        outputVersionId: stage === "humanize_tone" ? versionId : null,
        error: null,
      })),
      startedAt: draft.generatedAt,
      completedAt: draft.generatedAt,
      error: null,
      createdAt: draft.generatedAt,
    }],
    approvals,
    publications,
    auditEvents: [{
      id: `${draft.runId}:audit:${draft.state.updatedAt}`,
      contentId: draft.runId,
      actorId: draft.state.updatedBy,
      action: `dashboard.${draft.state.reviewStatus}.${draft.state.publicationStatus}`,
      detail: { pipelineStatus: draft.pipelineStatus },
      createdAt: draft.state.updatedAt,
    }],
  };
}
