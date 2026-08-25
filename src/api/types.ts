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
  mirrorSynced?: boolean;
  rewriteQueued?: boolean;
  rewriteStatus?: "queued" | "completed" | "failed" | null;
}

export interface ApiFreshness {
  source: "github" | "postgres-cache" | "local";
  stale: boolean;
  asOf: string | null;
  mirrorSynced?: boolean;
}

export interface ApiContentList {
  items: ApiContent[];
  freshness?: ApiFreshness;
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
  freshness?: ApiFreshness;
}

export interface ApiCapabilities {
  mode: string;
  integrations: Record<string, { configured: boolean; provider: string }>;
}

export interface ApiUser {
  id: string;
  name: string;
  roles: string[];
}

export interface ApiWorkflowRun {
  id: number;
  workflow: "collect" | "generate";
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface ApiTrendItem {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  postdate: string;
  candidateScore: number;
  matchedQueries: string[];
  bestSimilarityRank: number | null;
  bestRecentRank: number | null;
  observedDays: number;
  similarityTopDays: number;
  bestSearchTrend: {
    query?: string;
    category?: string;
    baselineAverage?: number | null;
    recentAverage?: number | null;
    direction?: "rising" | "stable" | "falling" | "insufficient";
    changePercent?: number | null;
    momentumScore?: number;
  } | null;
  scoreBreakdown: {
    freshness?: number;
    queryBreadth?: number;
    similarityRank?: number;
    persistence?: number;
    searchTrend?: number;
  } | null;
}

export interface ApiTrendSnapshot {
  collectionDate: string;
  collectedAt: string;
  queryCount: number;
  requestCount?: number;
  itemCount: number;
  source: string;
  collectionStrategy?: {
    sorts?: string[];
    resultsPerQuery?: number;
    historyWindowDays?: number;
    rankMeaning?: string;
  } | null;
  unavailableMetrics?: Record<string, string> | null;
  searchTrend?: {
    status?: "ok" | "unavailable";
    source?: string;
    startDate?: string;
    endDate?: string;
    windowDays?: number;
    recentDays?: number;
    baselineDays?: number;
    requestCount?: number;
    ratioMeaning?: string;
    directionMeaning?: string;
    reason?: string;
  } | null;
  items: ApiTrendItem[];
}
