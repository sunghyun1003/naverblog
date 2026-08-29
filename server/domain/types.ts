export const contentStates = [
  "idea",
  "researching",
  "brief_ready",
  "drafting",
  "review_ready",
  "approved",
  "scheduled",
  "published",
  "measured",
] as const;

export type ContentState = (typeof contentStates)[number];

export const userRoles = ["planner", "editor", "reviewer", "approver", "publisher", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const pipelineStages = [
  "collect_trends",
  "verify_sources",
  "create_brief",
  "write_draft",
  "optimize_seo",
  "optimize_geo",
  "humanize_tone",
  "quality_assurance",
  "notify_review",
] as const;
export type PipelineStage = (typeof pipelineStages)[number];

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type StepStatus = "pending" | "running" | "succeeded" | "failed";
export type QualityStatus = "passed" | "warning" | "failed";

export interface ContentRecord {
  id: string;
  creationKey: string;
  title: string;
  topic: string;
  strategy: "trend" | "original";
  state: ContentState;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  rewriteStatus?: "queued" | "completed" | "failed" | null;
}

export interface TrendSignal {
  id: string;
  sourceType: "naver_blog" | "community" | "youtube" | "official";
  title: string;
  url: string;
  publishedAt: string;
  engagementScore: number;
  relevanceScore: number;
  trustScore: number;
  topicKey: string;
  collectedAt: string;
}

export interface SourceRecord {
  id: string;
  contentId: string;
  organization: string;
  title: string;
  url: string;
  sourceType: "official" | "trend";
  publishedAt: string | null;
  collectedAt: string;
  trustGrade: "A" | "B" | "C";
}

export interface ClaimRecord {
  id: string;
  contentId: string;
  sourceId: string;
  statement: string;
  evidenceExcerpt: string;
  evidenceLocator: string;
  effectiveDate: string | null;
  verificationStatus: "verified" | "needs_review" | "rejected";
  createdAt: string;
}

export interface ContentBrief {
  audience: string;
  searchIntent: string;
  coreQuestion: string;
  angle: string;
  outline: string[];
  protectedTerms: string[];
}

export interface ContentVersion {
  id: string;
  contentId: string;
  sequence: number;
  stage: "brief" | "draft" | "seo" | "geo" | "human_tone" | "manual";
  title: string;
  body: string;
  brief: ContentBrief | null;
  createdBy: string;
  createdAt: string;
  parentVersionId: string | null;
  metadata: Record<string, unknown>;
}

export interface QualityResult {
  id: string;
  contentId: string;
  versionId: string;
  category: "facts" | "seo" | "geo" | "tone" | "native_korean" | "advertising" | "editorial";
  status: QualityStatus;
  score: number;
  messages: string[];
  checkedAt: string;
}

export interface JobStep {
  stage: PipelineStage;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  outputVersionId: string | null;
  error: string | null;
}

export interface AutomationJob {
  id: string;
  contentId: string;
  idempotencyKey: string;
  status: JobStatus;
  steps: JobStep[];
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  contentId: string;
  versionId: string;
  decision: "approved" | "rejected";
  actorId: string;
  reason: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  contentId: string | null;
  actorId: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface PublicationRecord {
  id: string;
  contentId: string;
  status: "prepared" | "scheduled" | "published" | "failed";
  scheduledAt: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentDetail {
  content: ContentRecord;
  versions: ContentVersion[];
  sources: SourceRecord[];
  claims: ClaimRecord[];
  qualityResults: QualityResult[];
  jobs: AutomationJob[];
  approvals: ApprovalRecord[];
  publications: PublicationRecord[];
  auditEvents: AuditEvent[];
}

export interface Actor {
  id: string;
  roles: UserRole[];
}
