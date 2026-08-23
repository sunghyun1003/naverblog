import { DomainError } from "../domain/errors.js";
import type {
  ApprovalRecord,
  AuditEvent,
  AutomationJob,
  ClaimRecord,
  ContentDetail,
  ContentRecord,
  ContentVersion,
  PublicationRecord,
  QualityResult,
  SourceRecord,
  TrendSignal,
} from "../domain/types.js";
import { normalizeUrl } from "../domain/utils.js";
import type { AutomationRepository } from "./contracts.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function upsertById<T extends { id: string }>(map: Map<string, T[]>, key: string, values: T[]): T[] {
  const next = new Map((map.get(key) ?? []).map((value) => [value.id, value]));
  for (const value of values) next.set(value.id, clone(value));
  map.set(key, [...next.values()]);
  return clone(values);
}

export class InMemoryAutomationRepository implements AutomationRepository {
  private readonly contents = new Map<string, ContentRecord>();
  private readonly contentKeys = new Map<string, string>();
  private readonly trends = new Map<string, TrendSignal>();
  private readonly sources = new Map<string, SourceRecord[]>();
  private readonly claims = new Map<string, ClaimRecord[]>();
  private readonly versions = new Map<string, ContentVersion[]>();
  private readonly jobs = new Map<string, AutomationJob>();
  private readonly jobKeys = new Map<string, string>();
  private readonly qualityResults = new Map<string, QualityResult[]>();
  private readonly approvals = new Map<string, ApprovalRecord[]>();
  private readonly publications = new Map<string, PublicationRecord[]>();
  private readonly auditEvents = new Map<string, AuditEvent[]>();

  async createContent(content: ContentRecord): Promise<ContentRecord> {
    if (this.contents.has(content.id)) {
      throw new DomainError("CONTENT_EXISTS", "이미 존재하는 콘텐츠입니다.", 409);
    }
    this.contents.set(content.id, clone(content));
    this.contentKeys.set(content.creationKey, content.id);
    return clone(content);
  }

  async updateContent(content: ContentRecord): Promise<ContentRecord> {
    if (!this.contents.has(content.id)) {
      throw new DomainError("CONTENT_NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    }
    this.contents.set(content.id, clone(content));
    return clone(content);
  }

  async getContent(id: string): Promise<ContentRecord | null> {
    const content = this.contents.get(id);
    return content ? clone(content) : null;
  }

  async findContentByCreationKey(key: string): Promise<ContentRecord | null> {
    const id = this.contentKeys.get(key);
    return id ? this.getContent(id) : null;
  }

  async listContents(): Promise<ContentRecord[]> {
    return [...this.contents.values()]
      .map(clone)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getContentDetail(id: string): Promise<ContentDetail | null> {
    const content = await this.getContent(id);
    if (!content) return null;
    return {
      content,
      versions: await this.listVersions(id),
      sources: await this.listSources(id),
      claims: await this.listClaims(id),
      qualityResults: await this.listQualityResults(id),
      jobs: await this.listJobs(id),
      approvals: await this.listApprovals(id),
      publications: await this.listPublications(id),
      auditEvents: await this.listAuditEvents(id),
    };
  }

  async saveTrendSignals(signals: TrendSignal[]): Promise<TrendSignal[]> {
    for (const signal of signals) this.trends.set(normalizeUrl(signal.url), clone(signal));
    return clone(signals);
  }

  async listTrendSignals(): Promise<TrendSignal[]> {
    return [...this.trends.values()]
      .map(clone)
      .sort((left, right) => right.engagementScore - left.engagementScore);
  }

  async saveSources(contentId: string, sources: SourceRecord[]): Promise<SourceRecord[]> {
    const existing = new Map((this.sources.get(contentId) ?? []).map((source) => [normalizeUrl(source.url), source]));
    for (const source of sources) existing.set(normalizeUrl(source.url), clone(source));
    this.sources.set(contentId, [...existing.values()]);
    return clone(sources);
  }

  async listSources(contentId: string): Promise<SourceRecord[]> {
    return clone(this.sources.get(contentId) ?? []);
  }

  async saveClaims(contentId: string, claims: ClaimRecord[]): Promise<ClaimRecord[]> {
    return upsertById(this.claims, contentId, claims);
  }

  async listClaims(contentId: string): Promise<ClaimRecord[]> {
    return clone(this.claims.get(contentId) ?? []);
  }

  async saveVersion(version: ContentVersion): Promise<ContentVersion> {
    upsertById(this.versions, version.contentId, [version]);
    return clone(version);
  }

  async listVersions(contentId: string): Promise<ContentVersion[]> {
    return clone(this.versions.get(contentId) ?? []).sort((left, right) => left.sequence - right.sequence);
  }

  async createJob(job: AutomationJob): Promise<AutomationJob> {
    const existingId = this.jobKeys.get(job.idempotencyKey);
    if (existingId) return clone(this.jobs.get(existingId)!);
    this.jobs.set(job.id, clone(job));
    this.jobKeys.set(job.idempotencyKey, job.id);
    return clone(job);
  }

  async updateJob(job: AutomationJob): Promise<AutomationJob> {
    if (!this.jobs.has(job.id)) throw new DomainError("JOB_NOT_FOUND", "작업을 찾을 수 없습니다.", 404);
    this.jobs.set(job.id, clone(job));
    return clone(job);
  }

  async getJob(id: string): Promise<AutomationJob | null> {
    const job = this.jobs.get(id);
    return job ? clone(job) : null;
  }

  async findJobByIdempotencyKey(key: string): Promise<AutomationJob | null> {
    const id = this.jobKeys.get(key);
    return id ? this.getJob(id) : null;
  }

  async listJobs(contentId: string): Promise<AutomationJob[]> {
    return [...this.jobs.values()]
      .filter((job) => job.contentId === contentId)
      .map(clone)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async saveQualityResults(contentId: string, results: QualityResult[]): Promise<QualityResult[]> {
    return upsertById(this.qualityResults, contentId, results);
  }

  async listQualityResults(contentId: string): Promise<QualityResult[]> {
    return clone(this.qualityResults.get(contentId) ?? []);
  }

  async saveApproval(approval: ApprovalRecord): Promise<ApprovalRecord> {
    upsertById(this.approvals, approval.contentId, [approval]);
    return clone(approval);
  }

  async listApprovals(contentId: string): Promise<ApprovalRecord[]> {
    return clone(this.approvals.get(contentId) ?? []);
  }

  async savePublication(publication: PublicationRecord): Promise<PublicationRecord> {
    const existing = (this.publications.get(publication.contentId) ?? []).filter((item) => item.id !== publication.id);
    this.publications.set(publication.contentId, [...existing, clone(publication)]);
    return clone(publication);
  }

  async listPublications(contentId: string): Promise<PublicationRecord[]> {
    return clone(this.publications.get(contentId) ?? []);
  }

  async appendAudit(event: AuditEvent): Promise<AuditEvent> {
    if (event.contentId) upsertById(this.auditEvents, event.contentId, [event]);
    return clone(event);
  }

  async listAuditEvents(contentId: string): Promise<AuditEvent[]> {
    return clone(this.auditEvents.get(contentId) ?? []);
  }
}
