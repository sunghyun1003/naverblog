import { pipelineStages, type ContentDetail, type ContentRecord, type ContentState } from "../domain/types.js";
import type {
  AutomationDraftDetail,
  AutomationDraftSummary,
  GeneratedDiscoveryQualitySection,
  GeneratedImageManifest,
  GeneratedImageStatus,
} from "./github-automation.js";

function discoveryQualitySummary(label: string, result: GeneratedDiscoveryQualitySection | null | undefined): string {
  if (!result) return `${label} 상세 검사가 도입되기 전에 생성된 원고입니다. 다음 재작성 또는 신규 생성부터 실제 점수가 표시됩니다.`;
  const failed = result.checks.filter((check) => !check.passed);
  const passedCount = result.checks.length - failed.length;
  if (!failed.length) return `${result.checks.length}개 기준을 모두 통과했습니다.`;
  return `${result.checks.length}개 중 ${passedCount}개 통과. 보완: ${failed.map((check) => `${check.label}(${check.detail})`).join(" · ")}`;
}

function sourceKey(url: string): string {
  return url.toLowerCase().replace(/\/+$/, "");
}

function hasCompleteImagePackage(draft: AutomationDraftSummary): boolean {
  if (draft.pipelineStatus !== "CONTENT_READY" || draft.imageGenerationStatus !== "ready") return false;
  if (!("imageManifest" in draft)) return true;
  const manifest = (draft as AutomationDraftDetail).imageManifest;
  return manifest?.status === "ready"
    && manifest.technicalQualityPassed === true
    && manifest.visualQualityPassed === true
    && manifest.assets.length > 0;
}

function contentState(draft: AutomationDraftSummary): ContentState {
  if (draft.deleted) return "deleted";
  if (draft.publicationStatus === "published") return "published";
  if (draft.publicationStatus === "scheduled") return "scheduled";
  if (draft.reviewStatus === "rejected") return "drafting";
  // A draft is operationally complete only after the image job has promoted
  // the whole package to CONTENT_READY. Review flags belong to the old manual
  // approval flow and must never make a text-only or failed-image draft look
  // complete in the dashboard.
  if (hasCompleteImagePackage(draft)) {
    return draft.reviewStatus === "pending" && draft.autoApproved !== true ? "review_ready" : "approved";
  }
  return "drafting";
}

function imagePackage(draft: AutomationDraftDetail): GeneratedImageManifest | GeneratedImageStatus | {
  schemaVersion: 1;
  status: "queued";
  runId: string;
  updatedAt: string;
  assets: [];
} | null {
  // A manual rerun can be queued while the previous ready/failed manifest is
  // still present in GitHub. The new queue state must win so the dashboard
  // does not keep rendering stale images as the current package.
  if (draft.imageGenerationStatus === "queued") {
    return {
      schemaVersion: 1,
      status: "queued",
      runId: draft.runId,
      updatedAt: draft.updatedAt,
      assets: [],
    };
  }
  if (draft.imageManifest) return draft.imageManifest;
  if (draft.imageStatus) return draft.imageStatus;
  return null;
}

function failedPipelineStage(draft: AutomationDraftDetail): (typeof pipelineStages)[number] | null {
  const recovery = draft.recovery;
  if (!recovery) return null;
  if (recovery.resumeFrom === "evidence") return "verify_sources";
  if (recovery.resumeFrom === "article") return "write_draft";
  if (recovery.resumeFrom === "tone") return "humanize_tone";
  return "quality_assurance";
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
    imageGenerationStatus: draft.imageGenerationStatus ?? null,
    imageGenerationWarning: draft.imageGenerationWarning ?? null,
  };
}

export function draftToDetail(draft: AutomationDraftDetail): ContentDetail {
  const content = draftToContent(draft);
  const currentRevision = draft.revision ?? draft.state.revision ?? 1;
  const versionIdForRevision = (revision: number) => revision === 1
    ? `${draft.runId}:human-tone`
    : `${draft.runId}:human-tone:${revision}`;
  const versionId = versionIdForRevision(currentRevision);
  const nativeKoreanQuality = draft.nativeKoreanQuality && draft.state.manualEdit
    ? {
        ...draft.nativeKoreanQuality,
        status: draft.nativeKoreanQuality.status === "failed" ? "failed" as const : "warning" as const,
        issues: [
          ...draft.nativeKoreanQuality.issues,
          {
            id: `${draft.runId}:manual-edit-quality-review`,
            path: "manualEdit.body",
            severity: "LOW" as const,
            category: "수동 수정 후 재검수",
            excerpt: draft.state.manualEdit.title,
            feedback: "수동 수정된 원고는 자동 검사 결과와 달라질 수 있습니다.",
            suggestedDirection: "최종 승인 전에 문장 흐름과 보험 용어를 한 번 더 확인하세요.",
            rewriteExample: "보험료·보장 범위·특약처럼 구체적인 용어를 사용하세요.",
          },
        ],
        counts: {
          ...draft.nativeKoreanQuality.counts,
          low: draft.nativeKoreanQuality.counts.low + 1,
        },
      }
    : draft.nativeKoreanQuality;
  const nativeKoreanPassed = !nativeKoreanQuality || nativeKoreanQuality.status !== "failed";
  const tonePassed = nativeKoreanPassed && (draft.toneVerdict === "PASS"
    || (draft.toneVerdict == null && draft.pipelineStatus === "TONE_REVIEW_COMPLETE" && draft.toneSkillApplied));
  const toneAcceptedWithWarnings = draft.toneAttempts?.acceptedWithWarnings === true;
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
  const seoQuality = draft.discoveryQuality?.seo;
  const geoQuality = draft.discoveryQuality?.geo;
  const editorialQuality = draft.editorialQuality;
  const advertisingQuality = draft.advertisingQuality;
  const advertisingMessage = advertisingQuality
    ? [
        advertisingQuality.summary,
        ...advertisingQuality.risks.map((risk) => `${risk.label}: ${risk.guidance}`),
        advertisingQuality.notice,
      ].join(" ")
    : "이 원고에는 이전 버전의 고정 안내만 있습니다. 새 원고 생성 또는 재작성 후 실제 광고 위험 검사가 적용됩니다.";
  const toneIssueCounts = (draft.toneReview?.issues ?? []).reduce((counts, issue) => {
    counts[issue.severity.toLowerCase() as "high" | "medium" | "low"] += 1;
    return counts;
  }, { high: 0, medium: 0, low: 0 });
  const toneMessage = draft.toneReview && draft.toneAttempts
    ? !nativeKoreanPassed
      ? `한국어 자연스러움 검사에서 보완이 필요합니다. HIGH ${nativeKoreanQuality?.counts.high ?? 0}건, MEDIUM ${nativeKoreanQuality?.counts.medium ?? 0}건. 자동 재작성 ${draft.toneAttempts.rewriteAttemptsPerformed}회가 실행됐습니다.`
      : tonePassed
      ? `사람 말투 검수 PASS. 자동 재작성 ${draft.toneAttempts.rewriteAttemptsPerformed}회 후 통과했습니다. ${draft.toneReview.summary}`
      : `자동 재작성 ${draft.toneAttempts.rewriteAttemptsPerformed}/${draft.toneAttempts.maxRewriteAttempts}회 후에도 보완이 필요합니다. 남은 문제: HIGH ${toneIssueCounts.high}건, MEDIUM ${toneIssueCounts.medium}건, LOW ${toneIssueCounts.low}건. ${draft.toneReview.summary}`
    : tonePassed
      ? "사람 말투 보정과 최종 PASS 검수가 완료됐습니다."
      : "자동 재작성 후에도 말투 문제가 남아 추가 검토가 필요합니다.";
  const nativeKoreanMessage = nativeKoreanQuality
    ? `번역체·추상 표현 검사 ${nativeKoreanQuality.status === "passed" ? "통과" : "확인 필요"}. HIGH ${nativeKoreanQuality.counts.high}건, MEDIUM ${nativeKoreanQuality.counts.medium}건, LOW ${nativeKoreanQuality.counts.low}건.`
    : "한국어 자연스러움 검사 결과가 없는 이전 원고입니다.";
  const toneDisplayMessage = toneAcceptedWithWarnings
    ? `제한된 자동 보정 후 완료했습니다. 잔여 말투 권고 ${draft.toneAttempts?.warningCount ?? 0}건은 참고용 경고로 남겼습니다.`
    : toneMessage;
  const qualitySeeds = [
    ["facts", factsStatus, factsScore, draft.evidencePackage
      ? `공식 출처 ${draft.evidencePackage.sources.length}개, 검증 주장 ${supportedEvidenceClaims}개, 미해결 주장 ${unresolvedEvidenceClaims}개, 추가 확인 ${evidenceGaps.length}개입니다.`
      : `사실 확인 항목 ${claims.length}건. 사람이 원문과 대조해야 합니다.`],
    ["seo", seoQuality?.status ?? "warning", seoQuality?.score ?? 60, discoveryQualitySummary("SEO", seoQuality)],
    ["geo", geoQuality?.status ?? "warning", geoQuality?.score ?? 60, discoveryQualitySummary("GEO", geoQuality)],
    ["editorial", editorialQuality?.status ?? "warning", editorialQuality?.score ?? 60, discoveryQualitySummary("편집 품질", editorialQuality)],
    ["tone", tonePassed ? "passed" : "failed", tonePassed ? 100 : 0, toneDisplayMessage],
    ["native_korean", nativeKoreanQuality?.status ?? "warning", nativeKoreanQuality?.score ?? 60, nativeKoreanMessage],
    ["advertising", advertisingQuality?.status ?? "warning", advertisingQuality?.score ?? 60, advertisingMessage],
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
  const recoveryFailedStage = failedPipelineStage(draft);
  const recoveryFailedIndex = recoveryFailedStage ? pipelineStages.indexOf(recoveryFailedStage) : -1;
  const jobFailed = Boolean(draft.recovery) || !tonePassed;

  return {
    content,
    automation: {
      autoApproved: draft.state.autoApproved === true,
      reviewStatus: draft.state.reviewStatus,
      manualEdit: Boolean(draft.state.manualEdit),
    },
    recovery: draft.recovery ? {
      failedStage: draft.recovery.failedStage,
      lastCompletedStage: draft.recovery.lastCompletedStage,
      resumeFrom: draft.recovery.resumeFrom,
      recoverable: draft.recovery.recoverable,
      message: draft.recovery.message,
      artifacts: draft.recovery.artifacts,
      updatedAt: draft.recovery.updatedAt,
    } : null,
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
      stage: draft.state.manualEdit ? "manual" : "human_tone",
      title: draft.title,
      body: draft.articleMarkdown,
      brief: null,
      createdBy: draft.state.manualEdit?.createdBy ?? "github-actions",
      createdAt: currentRevision > 1 ? draft.state.rewrittenAt ?? draft.updatedAt : draft.generatedAt,
      parentVersionId: currentRevision > 1 ? versionIdForRevision(currentRevision - 1) : null,
      metadata: {
        skillName: "demi",
        toneSkillApplied: draft.toneSkillApplied,
        toneVerdict: draft.toneVerdict,
        toneReview: draft.toneReview ?? null,
        toneAttempts: draft.toneAttempts ?? null,
        visualPlan: draft.article.article?.visualPlan ?? [],
        imagePackage: imagePackage(draft),
        editorialQuality: draft.editorialQuality ?? null,
        nativeKoreanQuality: nativeKoreanQuality ?? null,
        evidenceReview: draft.evidencePackage ?? null,
        revision: currentRevision,
        diffSummary: ["Humanizer 33개 패턴 진단", "피드백 반영 재작성", "사실·출처 보존 자체 감사"],
        copyPackage: draft.copyPackage,
        copyPackageHtml: draft.copyPackageHtml ?? null,
        manualEdit: draft.state.manualEdit ?? null,
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
      status: jobFailed ? "failed" : "succeeded",
      steps: pipelineStages.map((stage, index) => {
        const isRecoveryFailure = recoveryFailedStage === stage;
        const isPendingAfterRecovery = recoveryFailedIndex >= 0 && index > recoveryFailedIndex;
        const isToneFailure = !draft.recovery && stage === "humanize_tone" && !tonePassed;
        return {
          stage,
          status: isRecoveryFailure || isToneFailure ? "failed" as const : isPendingAfterRecovery ? "pending" as const : "succeeded" as const,
          startedAt: isPendingAfterRecovery ? null : draft.generatedAt,
          completedAt: isPendingAfterRecovery ? null : draft.generatedAt,
          outputVersionId: stage === "humanize_tone" && !isPendingAfterRecovery ? versionId : null,
          error: isRecoveryFailure ? draft.recovery?.message ?? "자동 생성이 중단됐습니다."
            : isToneFailure ? "자동 재작성 후에도 말투 이슈가 남았습니다."
              : null,
        };
      }),
      startedAt: draft.generatedAt,
      completedAt: draft.generatedAt,
      error: draft.recovery?.message ?? (tonePassed ? null : "사람 말투 추가 검토가 필요합니다."),
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
