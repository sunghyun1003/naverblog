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

export interface AutomationRepository {
  createContent(content: ContentRecord): Promise<ContentRecord>;
  updateContent(content: ContentRecord): Promise<ContentRecord>;
  getContent(id: string): Promise<ContentRecord | null>;
  deleteContentPermanently(id: string): Promise<boolean>;
  findContentByCreationKey(key: string): Promise<ContentRecord | null>;
  listContents(): Promise<ContentRecord[]>;
  getContentDetail(id: string): Promise<ContentDetail | null>;

  saveTrendSignals(signals: TrendSignal[]): Promise<TrendSignal[]>;
  listTrendSignals(): Promise<TrendSignal[]>;

  saveSources(contentId: string, sources: SourceRecord[]): Promise<SourceRecord[]>;
  listSources(contentId: string): Promise<SourceRecord[]>;
  saveClaims(contentId: string, claims: ClaimRecord[]): Promise<ClaimRecord[]>;
  listClaims(contentId: string): Promise<ClaimRecord[]>;

  saveVersion(version: ContentVersion): Promise<ContentVersion>;
  listVersions(contentId: string): Promise<ContentVersion[]>;

  createJob(job: AutomationJob): Promise<AutomationJob>;
  updateJob(job: AutomationJob): Promise<AutomationJob>;
  getJob(id: string): Promise<AutomationJob | null>;
  findJobByIdempotencyKey(key: string): Promise<AutomationJob | null>;
  listJobs(contentId: string): Promise<AutomationJob[]>;

  saveQualityResults(contentId: string, results: QualityResult[]): Promise<QualityResult[]>;
  listQualityResults(contentId: string): Promise<QualityResult[]>;
  saveApproval(approval: ApprovalRecord): Promise<ApprovalRecord>;
  listApprovals(contentId: string): Promise<ApprovalRecord[]>;
  savePublication(publication: PublicationRecord): Promise<PublicationRecord>;
  listPublications(contentId: string): Promise<PublicationRecord[]>;
  appendAudit(event: AuditEvent): Promise<AuditEvent>;
  listAuditEvents(contentId: string): Promise<AuditEvent[]>;
}
