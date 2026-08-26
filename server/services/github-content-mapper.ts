import { pipelineStages, type ContentDetail, type ContentRecord, type ContentState } from "../domain/types.js";
import type { AutomationDraftDetail, AutomationDraftSummary } from "./github-automation.js";

function sourceKey(url: string): string {
  return url.toLowerCase().replace(/\/+$/, "");
}

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
    rewriteStatus: draft.rewriteStatus ?? null,
  };
}

export function draftToDetail(draft: AutomationDraftDetail): ContentDetail {
  const content = draftToContent(draft);
  const currentRevision = draft.revision ?? draft.state.revision ?? 1;
  const versionIdForRevision = (revision: number) => revision === 1
    ? `${draft.runId}:human-tone`
    : `${draft.runId}:human-tone:${revision}`;
  const versionId = versionIdForRevision(currentRevision);
  const tonePassed = draft.toneVerdict === "PASS"
    || (draft.toneVerdict == null && draft.pipelineStatus === "TONE_REVIEW_COMPLETE" && draft.toneSkillApplied);
  const sourceByKey = new Map<string, ContentDetail["sources"][number]>();
  const sourceByEvidenceId = new Map<string, ContentDetail["sources"][number]>();
  const evidenceClaimById = new Map((draft.evidencePackage?.claims ?? []).map((claim) => [claim.id, claim]));
  const evidenceSourceByUrl = new Map((draft.evidencePackage?.sources ?? []).map((source) => [sourceKey(source.url), source]));
  const sourceByOriginalIndex: ContentDetail["sources"] = [];
  for (const [index, source] of (draft.article.sources ?? []).entries()) {
    const rawUrl = source.url?.trim() ?? "";
    const url = rawUrl || `urn:github-draft:${draft.runId}:source:${index + 1}`;
    const key = rawUrl ? sourceKey(rawUrl) : url;
    const evidenceSource = evidenceSourceByUrl.get(key);
    let normalized = sourceByKey.get(key);
    if (!normalized) {
      const isOfficial = source.sourceType === "OFFICIAL" || evidenceSource !== undefined;
      normalized = {
        id: `${draft.runId}:source:${index + 1}`,
        contentId: draft.runId,
        organization: evidenceSource?.institution ?? (isOfficial ? "공식 기관" : "NAVER 블로그"),
        title: evidenceSource?.title ?? (source.title?.trim() || `출처 ${index + 1}`),
        url,
        sourceType: isOfficial ? "official" as const : "trend" as const,
        publishedAt: evidenceSource?.publishedOrEffectiveDate ?? null,
        collectedAt: draft.generatedAt,
        trustGrade: evidenceSource?.authorityTier === 1 ? "A" as const : isOfficial ? "B" as const : "C" as const,
      };
      sourceByKey.set(key, normalized);
    }
    if (evidenceSource) sourceByEvidenceId.set(evidenceSource.id, normalized);
    sourceByOriginalIndex.push(normalized);
  }
  for (const evidenceSource of draft.evidencePackage?.sources ?? []) {
    if (sourceByEvidenceId.has(evidenceSource.id)) continue;
    const key = sourceKey(evidenceSource.url);
    const normalized = sourceByKey.get(key) ?? {
        id: `${draft.runId}:evidence-source:${evidenceSource.id}`,
        contentId: draft.runId,
        organization: evidenceSource.institution,
        title: evidenceSource.title,
        url: evidenceSource.url,
        sourceType: "official" as const,
        publishedAt: evidenceSource.publishedOrEffectiveDate,
        collectedAt: draft.generatedAt,
        trustGrade: evidenceSource.authorityTier === 1 ? "A" as const : "B" as const,
      };
    sourceByKey.set(key, normalized);
    sourceByEvidenceId.set(evidenceSource.id, normalized);
  }
  if (sourceByKey.size === 0 && (draft.article.factChecks?.length ?? 0) > 0) {
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
  const claims = (draft.article.factChecks ?? []).map((fact, index) => {
    const linkedEvidenceClaims = (fact.evidenceIds ?? []).map((id) => evidenceClaimById.get(id)).filter((claim) => claim !== undefined);
    const linkedEvidenceSourceIds = [...new Set(linkedEvidenceClaims.flatMap((claim) => claim.sourceIds))];
    const primaryEvidenceSource = linkedEvidenceSourceIds.map((id) => sourceByEvidenceId.get(id)).find((source) => source !== undefined);
    const fallbackSource = sourceByOriginalIndex[Math.min(index, sourceByOriginalIndex.length - 1)] ?? sources[0]!;
    const evidenceNotes = linkedEvidenceClaims.map((claim) => claim.scopeNote).filter(Boolean);
    const effectiveDate = linkedEvidenceSourceIds
      .map((id) => sourceByEvidenceId.get(id)?.publishedAt)
      .find((date): date is string => Boolean(date)) ?? null;
    return {
      id: `${draft.runId}:claim:${index + 1}`,
      contentId: draft.runId,
      sourceId: (primaryEvidenceSource ?? fallbackSource).id,
      statement: fact.claim ?? "검토 대상 주장",
      evidenceExcerpt: evidenceNotes.join(" ") || fact.verificationNote || "사람의 최종 검토가 필요합니다.",
      evidenceLocator: (fact.evidenceIds ?? []).length ? `evidence-package.claims:${fact.evidenceIds!.join(",")}` : `article.factChecks.${index}`,
      effectiveDate,
      verificationStatus: ["SUPPORTED", "CROSS_VERIFIED"].includes(fact.verificationStatus ?? "") || fact.status === "VERIFIED"
        ? "verified" as const
        : "needs_review" as const,
      createdAt: draft.generatedAt,
    };
  });
  const evidenceClaims = draft.evidencePackage?.claims ?? [];
  const supportedEvidenceClaims = evidenceClaims.filter((claim) => ["SUPPORTED", "CROSS_VERIFIED"].includes(claim.verificationStatus)).length;
  const unresolvedEvidenceClaims = evidenceClaims.length - supportedEvidenceClaims;
  const evidenceGaps = draft.evidencePackage?.gaps ?? [];
  const factsStatus = claims.length === 0
    ? "failed" as const
    : unresolvedEvidenceClaims > 0 || evidenceGaps.length > 0
      ? "warning" as const
      : "passed" as const;
  const factsScore = claims.length === 0 ? 0 : evidenceClaims.length
    ? Math.round((supportedEvidenceClaims / evidenceClaims.length) * 100)
    : 80;
  const qualitySeeds = [
    ["facts", factsStatus, factsScore, draft.evidencePackage
      ? `공식 출처 ${draft.evidencePackage.sources.length}개, 검증 주장 ${supportedEvidenceClaims}개, 미해결 주장 ${unresolvedEvidenceClaims}개, 추가 확인 ${evidenceGaps.length}개입니다.`
      : `사실 확인 항목 ${claims.length}건. 사람이 원문과 대조해야 합니다.`],
    ["seo", "passed", 90, `핵심 키워드: ${draft.primaryKeyword}`],
    ["geo", "passed", 90, "직접 답변, 질문 구조와 출처 목록이 생성됐습니다."],
    ["tone", tonePassed ? "passed" : "failed", tonePassed ? 100 : 0, tonePassed ? "demi Humanizer 재작성과 최종 PASS 검수가 완료됐습니다." : "자동 재작성 후에도 말투 이슈가 남아 추가 검토가 필요합니다."],
    ["advertising", "warning", 70, "보험 광고 표현은 사람이 최종 확인해야 합니다."],
  ] as const;
  const approvalCreatedAt = draft.state.reviewStatus === "approved"
    ? draft.state.approvedAt
    : draft.state.rejectedAt;
  const approvalActorId = draft.state.reviewStatus === "approved"
    ? draft.state.approvedBy ?? draft.state.updatedBy
    : draft.state.rejectedBy ?? draft.state.updatedBy;
  const currentApproval: ContentDetail["approvals"] = draft.state.reviewStatus === "pending" ? [] : [{
    id: `${draft.runId}:approval:${draft.state.reviewStatus}:${approvalCreatedAt ?? draft.state.updatedAt}`,
    contentId: draft.runId,
    versionId,
    decision: draft.state.reviewStatus,
    actorId: approvalActorId,
    reason: draft.state.reason,
    createdAt: approvalCreatedAt ?? draft.state.updatedAt,
  }];
  const historicApprovals: ContentDetail["approvals"] = (draft.state.decisionHistory ?? []).map((event) => ({
    id: `${draft.runId}:approval:${event.decision}:${event.createdAt}`,
    contentId: draft.runId,
    versionId: versionIdForRevision(event.revision),
    decision: event.decision,
    actorId: event.actorId,
    reason: event.reason,
    createdAt: event.createdAt,
  }));
  const approvals = [...historicApprovals, ...currentApproval].filter((approval, index, values) =>
    values.findIndex((candidate) => candidate.id === approval.id) === index,
  );
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
    versions: [...(draft.revisions ?? []).map((revision) => ({
      id: versionIdForRevision(revision.revision),
      contentId: draft.runId,
      sequence: revision.revision,
      stage: "human_tone" as const,
      title: revision.title,
      body: revision.articleMarkdown,
      brief: null,
      createdBy: "github-actions",
      createdAt: revision.createdAt,
      parentVersionId: revision.revision > 1 ? versionIdForRevision(revision.revision - 1) : null,
      metadata: {
        skillName: "demi",
        toneSkillApplied: true,
        revision: revision.revision,
        copyPackage: revision.copyPackage,
      },
    })), {
      id: versionId,
      contentId: draft.runId,
      sequence: currentRevision,
      stage: "human_tone",
      title: draft.title,
      body: draft.articleMarkdown,
      brief: null,
      createdBy: "github-actions",
      createdAt: currentRevision > 1 ? draft.state.rewrittenAt ?? draft.updatedAt : draft.generatedAt,
      parentVersionId: currentRevision > 1 ? versionIdForRevision(currentRevision - 1) : null,
      metadata: {
        skillName: "demi",
        toneSkillApplied: draft.toneSkillApplied,
        toneVerdict: draft.toneVerdict,
        evidenceReview: draft.evidencePackage ?? null,
        revision: currentRevision,
        diffSummary: ["Humanizer 33개 패턴 진단", "피드백 반영 재작성", "사실·출처 보존 자체 감사"],
        copyPackage: draft.copyPackage,
      },
    }],
    sources,
    claims,
    qualityResults: qualitySeeds.map(([category, status, score, message], index) => ({
      id: currentRevision === 1
        ? `${draft.runId}:quality:${index + 1}`
        : `${draft.runId}:quality:${currentRevision}:${index + 1}`,
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
      status: tonePassed ? "succeeded" : "failed",
      steps: pipelineStages.map((stage) => ({
        stage,
        status: stage === "humanize_tone" && !tonePassed ? "failed" : "succeeded",
        startedAt: draft.generatedAt,
        completedAt: draft.generatedAt,
        outputVersionId: stage === "humanize_tone" ? versionId : null,
        error: stage === "humanize_tone" && !tonePassed ? "자동 재작성 후에도 말투 이슈가 남았습니다." : null,
      })),
      startedAt: draft.generatedAt,
      completedAt: draft.generatedAt,
      error: tonePassed ? null : "사람 말투 추가 검토가 필요합니다.",
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
