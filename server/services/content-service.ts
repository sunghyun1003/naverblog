import type { AutomationAdapters } from "../adapters/contracts.js";
import { DomainError } from "../domain/errors.js";
import { requirePermission } from "../domain/permissions.js";
import { assertTransition } from "../domain/state-machine.js";
import type { Actor, AutomationJob, ContentDetail, ContentRecord, ContentVersion, PublicationRecord } from "../domain/types.js";
import type { Clock, IdFactory } from "../domain/utils.js";
import type { AutomationRepository } from "../repositories/contracts.js";
import { AutomationPipeline } from "./pipeline.js";

export interface CreateContentInput {
  title: string;
  topic: string;
  strategy: "trend" | "original";
  assigneeId?: string | null;
  idempotencyKey: string;
}

export interface ApprovalChecks {
  sources: boolean;
  advertising: boolean;
}

export interface EditContentInput {
  title: string;
  body: string;
  reason?: string | null;
}

export class ContentService {
  readonly pipeline: AutomationPipeline;

  constructor(
    private readonly repository: AutomationRepository,
    private readonly adapters: AutomationAdapters,
    private readonly clock: Clock,
    private readonly id: IdFactory,
  ) {
    this.pipeline = new AutomationPipeline(repository, adapters, clock, id);
  }

  async create(input: CreateContentInput, actor: Actor): Promise<ContentRecord> {
    requirePermission(actor, "content:create");
    const existing = await this.repository.findContentByCreationKey(input.idempotencyKey);
    if (existing) return existing;

    const now = this.clock();
    const content: ContentRecord = {
      id: this.id(),
      creationKey: input.idempotencyKey,
      title: input.title.trim(),
      topic: input.topic.trim(),
      strategy: input.strategy,
      state: "idea",
      assigneeId: input.assigneeId ?? actor.id,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
      scheduledAt: null,
      publishedAt: null,
    };
    await this.repository.createContent(content);
    await this.audit(content.id, actor.id, "content.created", { strategy: content.strategy, topic: content.topic });
    return content;
  }

  async list(): Promise<ContentRecord[]> {
    return (await this.repository.listContents()).filter((content) => content.state !== "deleted");
  }

  async detail(id: string): Promise<ContentDetail> {
    const detail = await this.repository.getContentDetail(id);
    if (!detail) throw new DomainError("CONTENT_NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    return detail;
  }

  async runPipeline(contentId: string, idempotencyKey: string, actor: Actor): Promise<AutomationJob> {
    requirePermission(actor, "pipeline:run");
    return this.pipeline.run({ contentId, idempotencyKey, actor });
  }

  async approve(contentId: string, checks: ApprovalChecks, actor: Actor): Promise<ContentRecord> {
    requirePermission(actor, "content:approve");
    if (!checks.sources || !checks.advertising) {
      throw new DomainError("APPROVAL_CHECKS_REQUIRED", "출처와 광고 표현을 모두 확인해야 승인할 수 있습니다.", 422);
    }
    const content = await this.requireContent(contentId);
    assertTransition(content.state, "approved");
    const version = await this.latestVersion(contentId);
    const qa = await this.repository.listQualityResults(contentId);
    if (qa.some((result) => result.versionId === version.id && result.status === "failed")) {
      throw new DomainError("QUALITY_GATE_FAILED", "실패한 품질 검사가 있어 승인할 수 없습니다.", 422);
    }
    await this.repository.saveApproval({
      id: this.id(),
      contentId,
      versionId: version.id,
      decision: "approved",
      actorId: actor.id,
      reason: null,
      createdAt: this.clock(),
    });
    return this.changeState(content, "approved", actor.id, "content.approved");
  }

  async reject(contentId: string, reason: string, actor: Actor): Promise<ContentRecord> {
    requirePermission(actor, "content:review");
    const content = await this.requireContent(contentId);
    assertTransition(content.state, "drafting");
    const version = await this.latestVersion(contentId);
    await this.repository.saveApproval({
      id: this.id(),
      contentId,
      versionId: version.id,
      decision: "rejected",
      actorId: actor.id,
      reason,
      createdAt: this.clock(),
    });
    return this.changeState(content, "drafting", actor.id, "content.rejected", { reason });
  }

  async edit(contentId: string, input: EditContentInput, actor: Actor): Promise<ContentRecord> {
    requirePermission(actor, "content:edit");
    const content = await this.requireContent(contentId);
    if (["scheduled", "published", "measured", "deleted"].includes(content.state)) {
      throw new DomainError("CONTENT_NOT_EDITABLE", "예약·발행된 원고와 삭제된 원고는 직접 수정할 수 없습니다.", 409);
    }
    const versions = await this.repository.listVersions(contentId);
    const previous = versions.at(-1);
    if (!previous) throw new DomainError("VERSION_NOT_FOUND", "수정할 원고 버전이 없습니다.", 409);
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 5 || body.length < 20) {
      throw new DomainError("INVALID_CONTENT_EDIT", "제목은 5자 이상, 원고는 20자 이상 입력해주세요.", 422);
    }
    const now = this.clock();
    await this.repository.saveVersion({
      id: this.id(),
      contentId,
      sequence: previous.sequence + 1,
      stage: "manual",
      title,
      body,
      brief: previous.brief,
      createdBy: actor.id,
      createdAt: now,
      parentVersionId: previous.id,
      metadata: { reason: input.reason?.trim() || null, editedManually: true },
    });
    const updated = await this.changeState(
      { ...content, title, state: "review_ready", rewriteStatus: null },
      "review_ready",
      actor.id,
      "content.edited",
      { reason: input.reason?.trim() || null, versionSequence: previous.sequence + 1 },
    );
    return updated;
  }

  async delete(contentId: string, actor: Actor): Promise<ContentRecord> {
    requirePermission(actor, "content:edit");
    const content = await this.requireContent(contentId);
    if (["scheduled", "published", "measured", "deleted"].includes(content.state)) {
      throw new DomainError("CONTENT_NOT_DELETABLE", "예약·발행된 원고와 이미 삭제된 원고는 삭제할 수 없습니다.", 409);
    }
    const deleted = await this.repository.deleteContentPermanently(contentId);
    if (!deleted) throw new DomainError("CONTENT_NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    return { ...content, state: "deleted", updatedAt: this.clock() };
  }

  async schedule(contentId: string, scheduledAt: string, actor: Actor): Promise<{ content: ContentRecord; publication: PublicationRecord }> {
    requirePermission(actor, "content:schedule");
    const content = await this.requireContent(contentId);
    assertTransition(content.state, "scheduled");
    const version = await this.latestVersion(contentId);
    const prepared = await this.adapters.publisher.prepare(content, version);
    const publication = await this.repository.savePublication({
      ...prepared,
      status: "scheduled",
      scheduledAt,
      updatedAt: this.clock(),
    });
    const updated = await this.changeState({ ...content, scheduledAt }, "scheduled", actor.id, "content.scheduled", { scheduledAt });
    return { content: updated, publication };
  }

  async publish(contentId: string, actor: Actor): Promise<{ content: ContentRecord; publication: PublicationRecord }> {
    requirePermission(actor, "content:publish");
    const content = await this.requireContent(contentId);
    assertTransition(content.state, "published");
    const publications = await this.repository.listPublications(contentId);
    const pending = publications.find((publication) => publication.status === "scheduled" || publication.status === "prepared");
    if (!pending) throw new DomainError("PUBLICATION_NOT_PREPARED", "예약되거나 준비된 발행 건이 없습니다.", 409);
    const publication = await this.adapters.publisher.publish(pending);
    await this.repository.savePublication(publication);
    const updated = await this.changeState(
      { ...content, publishedAt: publication.publishedAt },
      "published",
      actor.id,
      "content.published",
      { publicationId: publication.id, externalUrl: publication.externalUrl },
    );
    return { content: updated, publication };
  }

  private async latestVersion(contentId: string): Promise<ContentVersion> {
    const versions = await this.repository.listVersions(contentId);
    const version = versions.at(-1);
    if (!version) throw new DomainError("VERSION_NOT_FOUND", "승인할 원고 버전이 없습니다.", 409);
    return version;
  }

  private async requireContent(contentId: string): Promise<ContentRecord> {
    const content = await this.repository.getContent(contentId);
    if (!content) throw new DomainError("CONTENT_NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    return content;
  }

  private async changeState(
    content: ContentRecord,
    state: ContentRecord["state"],
    actorId: string,
    action: string,
    detail: Record<string, unknown> = {},
  ): Promise<ContentRecord> {
    const updated = { ...content, state, updatedAt: this.clock() };
    await this.repository.updateContent(updated);
    await this.audit(content.id, actorId, action, { from: content.state, to: state, ...detail });
    return updated;
  }

  private async audit(contentId: string, actorId: string, action: string, detail: Record<string, unknown>): Promise<void> {
    await this.repository.appendAudit({ id: this.id(), contentId, actorId, action, detail, createdAt: this.clock() });
  }
}
