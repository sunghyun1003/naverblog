import type { AutomationAdapters, GeneratedDocument } from "../adapters/contracts.js";
import { DomainError } from "../domain/errors.js";
import { assertTransition } from "../domain/state-machine.js";
import { pipelineStages, type Actor, type AutomationJob, type ContentBrief, type ContentRecord, type ContentVersion, type JobStep, type PipelineStage } from "../domain/types.js";
import type { Clock, IdFactory } from "../domain/utils.js";
import type { AutomationRepository } from "../repositories/contracts.js";

export interface RunPipelineInput {
  contentId: string;
  idempotencyKey: string;
  actor: Actor;
}

function initialSteps(): JobStep[] {
  return pipelineStages.map((stage) => ({
    stage,
    status: "pending",
    startedAt: null,
    completedAt: null,
    outputVersionId: null,
    error: null,
  }));
}

export class AutomationPipeline {
  constructor(
    private readonly repository: AutomationRepository,
    private readonly adapters: AutomationAdapters,
    private readonly clock: Clock,
    private readonly id: IdFactory,
  ) {}

  async run(input: RunPipelineInput): Promise<AutomationJob> {
    const existing = await this.repository.findJobByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;

    let content = await this.repository.getContent(input.contentId);
    if (!content) throw new DomainError("CONTENT_NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    if (content.state !== "idea") {
      throw new DomainError("PIPELINE_ALREADY_STARTED", "기획 상태의 콘텐츠만 새 파이프라인을 실행할 수 있습니다.", 409, {
        state: content.state,
      });
    }

    const now = this.clock();
    let job: AutomationJob = {
      id: this.id(),
      contentId: content.id,
      idempotencyKey: input.idempotencyKey,
      status: "running",
      steps: initialSteps(),
      startedAt: now,
      completedAt: null,
      error: null,
      createdAt: now,
    };
    job = await this.repository.createJob(job);

    let activeStage: PipelineStage | null = null;
    try {
      content = await this.transition(content, "researching", input.actor.id);

      activeStage = "collect_trends";
      job = await this.startStep(job, activeStage);
      const signals = await this.adapters.trendCollector.collect(content.topic);
      await this.repository.saveTrendSignals(signals);
      job = await this.completeStep(job, activeStage);

      activeStage = "verify_sources";
      job = await this.startStep(job, activeStage);
      const research = await this.adapters.researchVerifier.verify(content, signals);
      await this.repository.saveSources(content.id, research.sources);
      await this.repository.saveClaims(content.id, research.claims);
      job = await this.completeStep(job, activeStage);

      activeStage = "create_brief";
      job = await this.startStep(job, activeStage);
      const brief = await this.adapters.contentGenerator.createBrief(content, signals, research.claims);
      const briefVersion = await this.saveVersion(content, "brief", content.title, JSON.stringify(brief, null, 2), brief, input.actor.id, null, {
        trendSignalIds: signals.map((signal) => signal.id),
        claimIds: research.claims.map((claim) => claim.id),
      });
      content = await this.transition(content, "brief_ready", input.actor.id);
      job = await this.completeStep(job, activeStage, briefVersion.id);

      activeStage = "write_draft";
      job = await this.startStep(job, activeStage);
      content = await this.transition(content, "drafting", input.actor.id);
      let document = await this.adapters.contentGenerator.writeDraft(content, brief, research.claims);
      const draftVersion = await this.saveDocumentVersion(content, "draft", document, brief, input.actor.id, briefVersion.id);
      job = await this.completeStep(job, activeStage, draftVersion.id);

      activeStage = "optimize_seo";
      job = await this.startStep(job, activeStage);
      document = await this.adapters.contentGenerator.optimizeSeo(document, brief);
      const seoVersion = await this.saveDocumentVersion(content, "seo", document, brief, input.actor.id, draftVersion.id);
      job = await this.completeStep(job, activeStage, seoVersion.id);

      activeStage = "optimize_geo";
      job = await this.startStep(job, activeStage);
      document = await this.adapters.contentGenerator.optimizeGeo(document, research.claims);
      const geoVersion = await this.saveDocumentVersion(content, "geo", document, brief, input.actor.id, seoVersion.id);
      job = await this.completeStep(job, activeStage, geoVersion.id);

      activeStage = "humanize_tone";
      job = await this.startStep(job, activeStage);
      const toneResult = await this.adapters.humanToneRunner.run(document, brief.protectedTerms);
      if (toneResult.changedProtectedTerms.length > 0) {
        throw new DomainError("PROTECTED_TEXT_CHANGED", "말투 보정 과정에서 보호 문구가 변경됐습니다.", 422, {
          changedProtectedTerms: toneResult.changedProtectedTerms,
        });
      }
      const toneVersion = await this.saveDocumentVersion(content, "human_tone", toneResult, brief, input.actor.id, geoVersion.id, {
        diffSummary: toneResult.diffSummary,
        skillName: toneResult.skillName,
        skillVersion: toneResult.skillVersion,
      });
      job = await this.completeStep(job, activeStage, toneVersion.id);

      activeStage = "quality_assurance";
      job = await this.startStep(job, activeStage);
      const qualityResults = await this.adapters.qualityReviewer.review(content, toneVersion, research.claims);
      await this.repository.saveQualityResults(content.id, qualityResults);
      const failedChecks = qualityResults.filter((result) => result.status === "failed");
      if (failedChecks.length > 0) {
        throw new DomainError("QUALITY_GATE_FAILED", "자동 품질 검사를 통과하지 못했습니다.", 422, {
          categories: failedChecks.map((result) => result.category),
        });
      }
      content = await this.transition(content, "review_ready", input.actor.id);
      job = await this.completeStep(job, activeStage, toneVersion.id);

      activeStage = "notify_review";
      job = await this.startStep(job, activeStage);
      await this.adapters.notifier.notifyReviewReady(content, toneVersion);
      job = await this.completeStep(job, activeStage);

      job = { ...job, status: "succeeded", completedAt: this.clock() };
      await this.repository.updateJob(job);
      await this.audit(content.id, input.actor.id, "pipeline.succeeded", { jobId: job.id, versionId: toneVersion.id });
      return job;
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 자동화 오류";
      if (activeStage) job = await this.failStep(job, activeStage, message);
      job = { ...job, status: "failed", completedAt: this.clock(), error: message };
      await this.repository.updateJob(job);
      await this.audit(content.id, input.actor.id, "pipeline.failed", { jobId: job.id, stage: activeStage, error: message });
      throw error;
    }
  }

  private async transition(content: ContentRecord, state: ContentRecord["state"], actorId: string): Promise<ContentRecord> {
    assertTransition(content.state, state);
    const updated = { ...content, state, updatedAt: this.clock() };
    await this.repository.updateContent(updated);
    await this.audit(content.id, actorId, "content.state_changed", { from: content.state, to: state });
    return updated;
  }

  private async saveDocumentVersion(
    content: ContentRecord,
    stage: ContentVersion["stage"],
    document: GeneratedDocument,
    brief: ContentBrief,
    actorId: string,
    parentVersionId: string,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<ContentVersion> {
    return this.saveVersion(content, stage, document.title, document.body, brief, actorId, parentVersionId, {
      ...document.metadata,
      ...extraMetadata,
    });
  }

  private async saveVersion(
    content: ContentRecord,
    stage: ContentVersion["stage"],
    title: string,
    body: string,
    brief: ContentBrief | null,
    actorId: string,
    parentVersionId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<ContentVersion> {
    const versions = await this.repository.listVersions(content.id);
    return this.repository.saveVersion({
      id: this.id(),
      contentId: content.id,
      sequence: versions.length + 1,
      stage,
      title,
      body,
      brief,
      createdBy: actorId,
      createdAt: this.clock(),
      parentVersionId,
      metadata,
    });
  }

  private async startStep(job: AutomationJob, stage: PipelineStage): Promise<AutomationJob> {
    return this.updateStep(job, stage, { status: "running", startedAt: this.clock(), error: null });
  }

  private async completeStep(job: AutomationJob, stage: PipelineStage, outputVersionId: string | null = null): Promise<AutomationJob> {
    return this.updateStep(job, stage, { status: "succeeded", completedAt: this.clock(), outputVersionId });
  }

  private async failStep(job: AutomationJob, stage: PipelineStage, error: string): Promise<AutomationJob> {
    return this.updateStep(job, stage, { status: "failed", completedAt: this.clock(), error });
  }

  private async updateStep(job: AutomationJob, stage: PipelineStage, changes: Partial<JobStep>): Promise<AutomationJob> {
    const updated = {
      ...job,
      steps: job.steps.map((step) => (step.stage === stage ? { ...step, ...changes } : step)),
    };
    return this.repository.updateJob(updated);
  }

  private async audit(contentId: string, actorId: string, action: string, detail: Record<string, unknown>): Promise<void> {
    await this.repository.appendAudit({ id: this.id(), contentId, actorId, action, detail, createdAt: this.clock() });
  }
}
