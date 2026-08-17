export type ApiContentState =
  | "idea"
  | "researching"
  | "brief_ready"
  | "drafting"
  | "review_ready"
  | "approved"
  | "scheduled"
  | "published"
  | "measured";

export interface ApiContent {
  id: string;
  creationKey: string;
  title: string;
  topic: string;
  strategy: "trend" | "original";
  state: ApiContentState;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  scheduledAt: string | null;
  publishedAt: string | null;
}

export interface ApiJobStep {
  stage: string;
  status: "pending" | "running" | "succeeded" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  outputVersionId: string | null;
  error: string | null;
}

export interface ApiJob {
  id: string;
  contentId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  steps: ApiJobStep[];
  error: string | null;
}

export interface ApiContentVersion {
  id: string;
  sequence: number;
  stage: "brief" | "draft" | "seo" | "geo" | "human_tone" | "manual";
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ApiSource {
  id: string;
  organization: string;
  title: string;
  url: string;
  trustGrade: "A" | "B" | "C";
  collectedAt: string;
}

export interface ApiQualityResult {
  id: string;
  category: "facts" | "seo" | "geo" | "tone" | "advertising";
  status: "passed" | "warning" | "failed";
  score: number;
  messages: string[];
}

export interface ApiContentDetail {
  content: ApiContent;
  versions: ApiContentVersion[];
  sources: ApiSource[];
  claims: Array<{ id: string; statement: string; verificationStatus: string }>;
  qualityResults: ApiQualityResult[];
  jobs: ApiJob[];
  approvals: unknown[];
  publications: unknown[];
  auditEvents: Array<{ id: string; action: string; createdAt: string }>;
}

export interface ApiCapabilities {
  mode: string;
  integrations: Record<string, { configured: boolean; provider: string }>;
}
