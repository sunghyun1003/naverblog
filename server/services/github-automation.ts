import { DomainError } from "../domain/errors.js";

export interface GitHubAutomationConfig {
  owner: string;
  repository: string;
  branch: string;
  token: string;
}

export type DashboardReviewStatus = "pending" | "approved" | "rejected";
export type DashboardPublicationStatus = "none" | "scheduled" | "published";
export type DashboardRewriteStatus = "queued" | "completed" | "failed";

export interface DashboardManualEdit {
  title: string;
  body: string;
  reason: string | null;
  createdAt: string;
  createdBy: string;
  baseRevision: number;
}

export interface DashboardDecisionEvent {
  decision: "approved" | "rejected";
  reason: string | null;
  actorId: string;
  createdAt: string;
  revision: number;
}

export interface DashboardDraftState {
  schemaVersion: 1;
  runId: string;
  reviewStatus: DashboardReviewStatus;
  autoApproved?: boolean;
  publicationStatus: DashboardPublicationStatus;
  checks: { sources: boolean; advertising: boolean };
  reason: string | null;
  approvedBy?: string | null;
  rejectedBy?: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  revision?: number;
  rewriteStatus?: DashboardRewriteStatus | null;
  rewriteRequestedAt?: string | null;
  rewrittenAt?: string | null;
  decisionHistory?: DashboardDecisionEvent[];
  manualEdit?: DashboardManualEdit | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  imageGenerationStatus?: "queued" | "ready" | "failed" | null;
  imageGenerationWarning?: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface AutomationDraftSummary {
  runId: string;
  title: string;
  topic: string;
  primaryKeyword: string;
  generatedAt: string;
  pipelineStatus: string;
  toneSkillApplied: boolean;
  toneVerdict?: "PASS" | "REWRITE_REQUIRED" | null;
  updatedAt: string;
  reviewStatus: DashboardReviewStatus;
  autoApproved?: boolean;
  publicationStatus: DashboardPublicationStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  revision?: number;
  rewriteStatus?: DashboardRewriteStatus | null;
  imageGenerationStatus?: "queued" | "ready" | "failed" | null;
  imageGenerationWarning?: string | null;
  deleted?: boolean;
}

export interface AutomationDraftRevision {
  revision: number;
  title: string;
  articleMarkdown: string;
  copyPackage: string;
  createdAt: string;
}

export interface AutomationDraftDetail extends AutomationDraftSummary {
  articleMarkdown: string;
  copyPackage: string;
  copyPackageHtml?: string | null;
  sourcesMarkdown: string;
  article: GeneratedArticle;
  evidencePackage?: GeneratedEvidencePackage | null;
  discoveryQuality?: GeneratedDiscoveryQuality | null;
  advertisingQuality?: GeneratedAdvertisingQuality | null;
  editorialQuality?: GeneratedEditorialQuality | null;
  nativeKoreanQuality?: GeneratedNativeKoreanQuality | null;
  toneReview?: GeneratedToneReview | null;
  toneAttempts?: GeneratedToneAttempts | null;
  imageManifest?: GeneratedImageManifest | null;
  imageStatus?: GeneratedImageStatus | null;
  state: DashboardDraftState;
  revisions?: AutomationDraftRevision[];
}

export interface GeneratedImageAsset {
  id: string;
  role: "hero" | "inline";
  kind: "ai_generated";
  path: string;
  afterSection: number;
  purpose: "concept" | "comparison" | "checklist" | "process";
  altText: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

export interface GeneratedImageManifest {
  schemaVersion: number;
  status: "ready" | "failed";
  generatedAt: string;
  runId: string;
  sourceRevision: number;
  styleProfileId: string;
  technicalQualityPassed: boolean;
  visualQualityPassed?: boolean;
  humanReviewRequired: true;
  visualQuality: {
    overallPassed: boolean;
    summary: string;
    assets: Array<{
      id: string;
      passed: boolean;
      scores: { realism: number; composition: number; relevance: number; artifactControl: number };
      defects: string[];
      recommendation: string;
    }>;
  };
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  assets: GeneratedImageAsset[];
  /** True when failed candidates were retained for authenticated inspection. */
  candidateAssetsPreserved?: boolean;
}

export interface GeneratedImageStatus {
  schemaVersion: number;
  status: "failed";
  updatedAt: string;
  runId: string;
  message: string;
}

export interface GeneratedDiscoveryQualityCheck {
  id: string;
  label: string;
  points: number;
  critical: boolean;
  passed: boolean;
  detail: string;
}

export interface GeneratedDiscoveryQualitySection {
  score: number;
  status: "passed" | "warning" | "failed";
  checks: GeneratedDiscoveryQualityCheck[];
}

export interface GeneratedDiscoveryQuality {
  schemaVersion: number;
  checkedAt: string;
  seo: GeneratedDiscoveryQualitySection;
  geo: GeneratedDiscoveryQualitySection;
}

export interface GeneratedAdvertisingQualityRisk {
  id: string;
  label: string;
  severity: "critical" | "high";
  penalty: number;
  excerpts: string[];
  guidance: string;
}

export interface GeneratedAdvertisingQuality {
  schemaVersion: number;
  checkedAt: string;
  status: "warning" | "failed";
  score: number;
  automatedCheckPassed: boolean;
  humanReviewRequired: true;
  summary: string;
  risks: GeneratedAdvertisingQualityRisk[];
  notice: string;
}

export interface GeneratedEditorialQuality {
  schemaVersion: number;
  checkedAt: string;
  score: number;
  status: "passed" | "warning" | "failed";
  checks: GeneratedDiscoveryQualityCheck[];
}

export interface GeneratedNativeKoreanQuality {
  schemaVersion: number;
  checkedAt: string;
  status: "passed" | "warning" | "failed";
  score: number;
  counts: { high: number; medium: number; low: number };
  issues: Array<{
    id: string;
    path: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    category: string;
    excerpt: string;
    feedback: string;
    suggestedDirection: string;
    rewriteExample?: string;
  }>;
  checkedFields?: string[];
}

export interface GeneratedToneReview {
  verdict: "PASS" | "REWRITE_REQUIRED";
  summary: string;
  issues: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    excerpt: string;
    feedback: string;
    suggestedDirection: string;
  }>;
  rewriteInstructions: string[];
}

export interface GeneratedToneAttempts {
  schemaVersion: number;
  completedAt: string;
  maxRewriteAttempts: number;
  rewriteAttemptsPerformed: number;
  finalVerdict: "PASS" | "REWRITE_REQUIRED";
  latestVerdict?: "PASS" | "REWRITE_REQUIRED";
  selectedReviewIndex?: number;
  selectedScore?: number;
  exhausted: boolean;
  acceptedWithWarnings?: boolean;
  warningCount?: number;
  finalValidationVerdict?: "PASS" | "REWRITE_REQUIRED";
  finalValidationSummary?: string;
  attempts: Array<{
    reviewIndex: number;
    stage: string;
    verdict: "PASS" | "REWRITE_REQUIRED";
    summary: string;
    score?: number;
    issueCounts: { high: number; medium: number; low: number };
    feedbackFile: string;
    articleFile: string;
  }>;
}

export type AutomationWorkflow = "collect" | "generate" | "images" | "rewrite";

export interface WorkflowRunSummary {
  id: number;
  workflow: AutomationWorkflow;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export type AutomationFrequency = "daily" | "weekdays" | "weekly";

export interface AutomationSchedule {
  enabled: boolean;
  frequency: AutomationFrequency;
  time: string;
  weekday: number;
}

export interface AutomationSettings {
  schemaVersion: 1;
  timezone: "Asia/Seoul";
  collection: AutomationSchedule;
  generation: AutomationSchedule & { count: number };
}

export interface AutomationTokenUsage {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Character count of prompts sent to Codex, recorded for cost diagnostics. */
  promptChars: number;
  /** Rough prompt-token estimate (UTF-8 bytes ÷ 4), not provider billing. */
  estimatedPromptTokens: number;
}

export interface AutomationHistoryItem {
  id: string;
  workflowRunId: number;
  workflow: AutomationWorkflow;
  job: string;
  event: string;
  status: "success" | "failure" | "cancelled" | "running" | "queued" | "skipped";
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  contentRunId: string | null;
  contentTitle: string | null;
  codex: AutomationTokenUsage;
  failedStage: string | null;
  failureCode: string | null;
  error: string | null;
  draftSaved?: boolean;
  recoveryAction?: "tone_resume" | "image_retry" | null;
  url: string;
}

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha?: string;
}

interface GitHubFileResponse {
  content: string;
  encoding: string;
  sha: string;
}

export interface GeneratedArticle {
  planning?: { topic?: string };
  seo?: { primaryKeyword?: string };
  article?: {
    title?: string;
    visualPlan?: Array<{
      afterSection?: number;
      purpose?: "concept" | "comparison" | "checklist" | "process";
      brief?: string;
      altText?: string;
    }>;
  };
  factChecks?: Array<{
    claim?: string;
    status?: string;
    verificationNote?: string;
    evidenceIds?: string[];
    verificationStatus?: "SUPPORTED" | "CROSS_VERIFIED" | "CONDITIONAL" | "UNRESOLVED";
  }>;
  sources?: Array<{
    title?: string;
    url?: string;
    usedFor?: string;
    sourceType?: "OFFICIAL" | "TREND_REFERENCE";
    evidenceIds?: string[];
  }>;
}

export interface GeneratedEvidencePackage {
  schemaVersion: number;
  topic: string;
  contentBrief: {
    primaryIntent: string;
    secondaryIntent: string;
    audienceMoment: string;
    readerProblem: string;
    contentPromise: string;
    differentiation: string;
    outlineLogic: string[];
    prohibitedAngles: string[];
  };
  researchQuestions: Array<{
    id: string;
    question: string;
    claimType: string;
    whyNeeded: string;
  }>;
  sources: Array<{
    id: string;
    institution: string;
    authorityTier: 1 | 2;
    sourceType: string;
    title: string;
    url: string;
    publishedOrEffectiveDate: string | null;
    supportSummary: string;
  }>;
  claims: Array<{
    id: string;
    claim: string;
    claimType: string;
    sourceIds: string[];
    verificationStatus: "SUPPORTED" | "CROSS_VERIFIED" | "CONDITIONAL" | "UNRESOLVED";
    scopeNote: string;
  }>;
  gaps: Array<{
    questionId: string;
    reason: string;
    draftHandling: "omit" | "qualify" | "human_review";
  }>;
}

interface GeneratedStatus {
  generatedAt?: string;
  updatedAt?: string;
  revision?: number;
  status?: string;
  toneSkillApplied?: boolean;
  toneVerdict?: "PASS" | "REWRITE_REQUIRED" | null;
  imageGenerationStatus?: "queued" | "ready" | "failed" | null;
  imageGenerationWarning?: string | null;
  codexCalls?: number;
  codexUsage?: AutomationTokenUsage;
}

interface WorkflowRunsResponse {
  workflow_runs: Array<{
    id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    updated_at: string;
    html_url: string;
    event?: string;
    path?: string;
    display_title?: string;
  }>;
}

interface GitHubJobsResponse {
  jobs: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    steps?: Array<{ name: string; status: string; conclusion: string | null }>;
  }>;
}

interface StoredAutomationHistory {
  workflowRunId: number | string;
  workflow: AutomationWorkflow;
  job: string;
  event?: string;
  status: "success" | "failure" | "cancelled" | "skipped";
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  contentRunId?: string | null;
  contentTitle?: string | null;
  codex?: Partial<AutomationTokenUsage>;
  lastStage?: string | null;
  failedStage?: string | null;
  failureCode?: string | null;
  error?: string | null;
  draftSaved?: boolean;
  recoveryAction?: "tone_resume" | "image_retry" | null;
  url?: string | null;
}

interface CollectedTrendSnapshot {
  schemaVersion?: number;
  source?: string;
  collectedAt?: string;
  collectionDate?: string;
  queryCount?: number;
  requestCount?: number;
  itemCount?: number;
  collectionStrategy?: {
    sorts?: string[];
    resultsPerQuery?: number;
    historyWindowDays?: number;
    rankMeaning?: string;
  };
  unavailableMetrics?: Record<string, string>;
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
  };
  items?: Array<{
    title?: string;
    link?: string;
    description?: string;
    bloggerName?: string;
    postDate?: string;
    candidateScore?: number;
    matchedQueries?: string[];
    bestSimilarityRank?: number | null;
    bestRecentRank?: number | null;
    observedDays?: number;
    similarityTopDays?: number;
    bestSearchTrend?: {
      query?: string;
      category?: string;
      baselineAverage?: number | null;
      recentAverage?: number | null;
      direction?: "rising" | "stable" | "falling" | "insufficient";
      changePercent?: number | null;
      momentumScore?: number;
    } | null;
    scoreBreakdown?: {
      total?: number;
      freshness?: number;
      similarityRank?: number;
      keywordRelevance?: number;
      relativeDemand?: number;
      trendMomentum?: number;
      fourWeekPersistence?: number;
      intentFit?: number;
    };
  }>;
}

type Fetcher = typeof fetch;

const apiBase = "https://api.github.com";

function encodeRepositoryPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function pathHasTraversal(value: string): boolean {
  return value.includes("..") || value.includes("/") || value.includes("\\");
}

function imageContentType(value: string): string {
  if (/\.png$/i.test(value)) return "image/png";
  if (/\.webp$/i.test(value)) return "image/webp";
  return "image/jpeg";
}

function isLargeGitHubFileError(error: unknown): boolean {
  return error instanceof Error && /(?:1\s*MB|large file|file is too large|blob api)/i.test(error.message);
}

const defaultAutomationSettings: AutomationSettings = {
  schemaVersion: 1,
  timezone: "Asia/Seoul",
  collection: { enabled: true, frequency: "daily", time: "06:30", weekday: 1 },
  generation: { enabled: true, frequency: "daily", time: "07:00", weekday: 1, count: 1 },
};

function workflowFromPath(value: string | undefined): AutomationWorkflow | null {
  const match = value?.match(/\/(collect|generate|images|rewrite)\.yml(?:@|$)/);
  return match?.[1] as AutomationWorkflow | undefined ?? null;
}

function zeroTokenUsage(value?: Partial<AutomationTokenUsage>): AutomationTokenUsage {
  const inputTokens = Number(value?.inputTokens ?? 0);
  const cachedInputTokens = Number(value?.cachedInputTokens ?? 0);
  const outputTokens = Number(value?.outputTokens ?? 0);
  const recordedTotal = Number(value?.totalTokens ?? 0);
  const promptChars = Number(value?.promptChars ?? 0);
  const estimatedPromptTokens = Number(value?.estimatedPromptTokens ?? 0);
  return {
    calls: Number(value?.calls ?? 0),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    // Older history files did not persist totalTokens. Derive it from the
    // detailed counters so the dashboard never reports 0 for a real call.
    totalTokens: recordedTotal > 0 ? recordedTotal : inputTokens + outputTokens,
    promptChars: Number.isFinite(promptChars) ? promptChars : 0,
    estimatedPromptTokens: Number.isFinite(estimatedPromptTokens) ? estimatedPromptTokens : 0,
  };
}

function scheduleCron(schedule: AutomationSchedule, minuteOffset = 0): string {
  const [hourText, minuteText] = schedule.time.split(":");
  const totalMinutes = (Number(hourText) * 60 + Number(minuteText) + minuteOffset) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const day = schedule.frequency === "weekdays" ? "1-5" : schedule.frequency === "weekly" ? String(schedule.weekday) : "*";
  return `${minute} ${hour} * * ${day}`;
}

function renderScheduleBlock(schedule: AutomationSchedule): string {
  const lines = ["  # dashboard-schedule:start"];
  if (schedule.enabled) {
    lines.push("  schedule:");
    // A schedule represents one durable job, not a retry loop. Recovery is
    // handled by the workflow guard and explicit dispatch instead of hidden
    // cron waves that can consume Codex tokens more than once.
    lines.push(`    - cron: "${scheduleCron(schedule)}"`);
    lines.push("      timezone: \"Asia/Seoul\"");
  }
  lines.push("  # dashboard-schedule:end");
  return lines.join("\n");
}

function replaceScheduleBlock(source: string, schedule: AutomationSchedule): string {
  const marker = /  # dashboard-schedule:start[\s\S]*?  # dashboard-schedule:end/;
  if (!marker.test(source)) throw new Error("워크플로우에서 대시보드 일정 영역을 찾지 못했습니다.");
  return source.replace(marker, renderScheduleBlock(schedule));
}

function defaultState(runId: string, generatedAt: string): DashboardDraftState {
  return {
    schemaVersion: 1,
    runId,
    reviewStatus: "pending",
    publicationStatus: "none",
    checks: { sources: false, advertising: false },
    reason: null,
    approvedBy: null,
    rejectedBy: null,
    approvedAt: null,
    rejectedAt: null,
    scheduledAt: null,
    publishedAt: null,
    externalUrl: null,
    updatedAt: generatedAt,
    updatedBy: "system",
  };
}

export class GitHubAutomationService {
  private automationSettingsCache: { value: AutomationSettings; expiresAt: number } | null = null;
  private automationHistoryCache: { value: AutomationHistoryItem[]; expiresAt: number } | null = null;
  private automationHistoryRequest: Promise<AutomationHistoryItem[]> | null = null;
  private repositoryTreeCache: { value: GitHubTreeItem[]; expiresAt: number } | null = null;
  private repositoryTreeRequest: Promise<GitHubTreeItem[]> | null = null;
  private workflowRunsCache: { value: WorkflowRunSummary[]; expiresAt: number } | null = null;
  private workflowRunsRequest: Promise<WorkflowRunSummary[]> | null = null;
  private trendSnapshotCache: { value: CollectedTrendSnapshot; expiresAt: number } | null = null;
  private trendSnapshotRequest: Promise<CollectedTrendSnapshot> | null = null;
  private readonly repositoryTreeCacheTtlMs = 30_000;
  private readonly workflowRunsCacheTtlMs = 15_000;
  private readonly trendSnapshotCacheTtlMs = 30_000;

  constructor(private readonly config: GitHubAutomationConfig, private readonly request: Fetcher = fetch) {}

  async capabilities(existingRuns?: WorkflowRunSummary[]) {
    const runs = existingRuns ?? await this.listWorkflowRuns();
    return {
      mode: "github-actions",
      repository: `${this.config.owner}/${this.config.repository}`,
      branch: this.config.branch,
      latestCollectionRun: runs.find((run) => run.workflow === "collect") ?? null,
      latestGenerationRun: runs.find((run) => run.workflow === "generate") ?? null,
    };
  }

  async listWorkflowRuns(): Promise<WorkflowRunSummary[]> {
    if (this.workflowRunsCache && this.workflowRunsCache.expiresAt > Date.now()) {
      return this.workflowRunsCache.value;
    }
    if (this.workflowRunsRequest) return this.workflowRunsRequest;
    this.workflowRunsRequest = this.loadWorkflowRuns().finally(() => {
      this.workflowRunsRequest = null;
    });
    return this.workflowRunsRequest;
  }

  private async loadWorkflowRuns(): Promise<WorkflowRunSummary[]> {
    const workflows = ["collect", "generate"] as const;
    const responses = await Promise.all(workflows.map(async (workflow) => {
      const payload = await this.github<WorkflowRunsResponse>(
        `/actions/workflows/${workflow}.yml/runs?branch=${encodeURIComponent(this.config.branch)}&per_page=5`,
      );
      return payload.workflow_runs.map((run) => ({
        id: run.id,
        workflow,
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        url: run.html_url,
      }));
    }));
    const value = responses.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    this.workflowRunsCache = { value, expiresAt: Date.now() + this.workflowRunsCacheTtlMs };
    return value;
  }

  async getAutomationSettings(): Promise<AutomationSettings> {
    if (this.automationSettingsCache && this.automationSettingsCache.expiresAt > Date.now()) return this.automationSettingsCache.value;
    const value = await this.readOptionalJson<AutomationSettings>("config/automation-settings.json") ?? defaultAutomationSettings;
    this.automationSettingsCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }

  async updateAutomationSettings(settings: AutomationSettings): Promise<AutomationSettings> {
    const [collectWorkflow, generateWorkflow] = await Promise.all([
      this.readText(".github/workflows/collect.yml"),
      this.readText(".github/workflows/generate.yml"),
    ]);
    const files = {
      "config/automation-settings.json": `${JSON.stringify(settings, null, 2)}\n`,
      ".github/workflows/collect.yml": `${replaceScheduleBlock(collectWorkflow, settings.collection).trimEnd()}\n`,
      ".github/workflows/generate.yml": `${replaceScheduleBlock(generateWorkflow, settings.generation).trimEnd()}\n`,
    };
    await this.commitFiles(files, "dashboard: update automation schedule");
    this.automationSettingsCache = { value: settings, expiresAt: Date.now() + 60_000 };
    return settings;
  }

  async listAutomationHistory(limit = 50): Promise<AutomationHistoryItem[]> {
    if (this.automationHistoryCache && this.automationHistoryCache.expiresAt > Date.now()) {
      return this.automationHistoryCache.value.slice(0, limit);
    }
    if (this.automationHistoryRequest) {
      const value = await this.automationHistoryRequest;
      return value.slice(0, limit);
    }
    // History combines a workflow-run request, a repository tree request, and
    // one read per stored record. Deduplicate concurrent dashboard requests so
    // tab changes and the home summary cannot multiply that fan-out.
    this.automationHistoryRequest = this.loadAutomationHistory(limit).finally(() => {
      this.automationHistoryRequest = null;
    });
    const value = await this.automationHistoryRequest;
    return value.slice(0, limit);
  }

  private async loadAutomationHistory(limit = 50): Promise<AutomationHistoryItem[]> {
    const [runsPayload, repositoryTree] = await Promise.all([
      this.github<WorkflowRunsResponse>(`/actions/runs?branch=${encodeURIComponent(this.config.branch)}&per_page=${Math.min(100, limit)}`),
      this.tree(),
    ]);
    const runs = runsPayload.workflow_runs.flatMap((run) => {
      const workflow = workflowFromPath(run.path);
      return workflow ? [{ ...run, workflow }] : [];
    });
    const historyPaths = repositoryTree
      .map((item) => item.path)
      .filter((value) => /^output\/history\/\d+-.+\.json$/.test(value))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, limit * 2);
    const stored = (await Promise.all(historyPaths.map((value) => this.readOptionalJson<StoredAutomationHistory>(value))))
      .filter((value): value is StoredAutomationHistory => Boolean(value));
    const runById = new Map(runs.map((run) => [run.id, run]));
    const savedDraftRunIds = new Set(repositoryTree
      .map((item) => item.path.match(/^output\/drafts\/\d{4}-\d{2}-\d{2}\/run-(\d+)\/status\.json$/)?.[1])
      .filter((value): value is string => Boolean(value)));
    const enriched = await Promise.all(stored.map(async (record): Promise<AutomationHistoryItem> => {
      const workflowRunId = Number(record.workflowRunId);
      const run = runById.get(workflowRunId);
      const failedStage = record.failedStage ?? (record.status === "failure" && run ? await this.failedStep(workflowRunId) : null);
      return {
        id: `${workflowRunId}-${record.job}`,
        workflowRunId,
        workflow: record.workflow,
        job: record.job,
        event: record.event ?? run?.event ?? "unknown",
        status: record.status,
        startedAt: record.startedAt || run?.created_at || new Date(0).toISOString(),
        finishedAt: record.finishedAt || run?.updated_at || null,
        durationSeconds: Number.isFinite(record.durationSeconds) ? record.durationSeconds : null,
        contentRunId: record.contentRunId ?? null,
        contentTitle: record.contentTitle ?? null,
        codex: zeroTokenUsage(record.codex),
        failedStage,
        failureCode: record.failureCode ?? null,
        error: record.error ?? null,
        draftSaved: record.draftSaved === true || savedDraftRunIds.has(String(workflowRunId)),
        recoveryAction: record.recoveryAction
          ?? (record.status === "failure" && savedDraftRunIds.has(String(workflowRunId))
            ? (record.job === "images" ? "image_retry" : "tone_resume")
            : null),
        url: record.url ?? run?.html_url ?? "",
      };
    }));
    const storedRunIds = new Set(stored.map((record) => Number(record.workflowRunId)));
    const fallback = await Promise.all(runs.filter((run) => !storedRunIds.has(run.id)).map(async (run): Promise<AutomationHistoryItem> => {
      const running = run.status !== "completed";
      const status = running ? (run.status === "queued" ? "queued" : "running") : run.conclusion === "success" ? "success" : run.conclusion === "cancelled" ? "cancelled" : "failure";
      return {
        id: `${run.id}-${run.workflow}`,
        workflowRunId: run.id,
        workflow: run.workflow,
        job: run.workflow,
        event: run.event ?? "unknown",
        status,
        startedAt: run.created_at,
        finishedAt: running ? null : run.updated_at,
        durationSeconds: running ? null : Math.max(0, Math.round((Date.parse(run.updated_at) - Date.parse(run.created_at)) / 1000)),
        contentRunId: run.workflow === "generate" && (status === "success" || savedDraftRunIds.has(String(run.id))) ? String(run.id) : null,
        contentTitle: null,
        codex: zeroTokenUsage(),
        failedStage: status === "failure" ? await this.failedStep(run.id) : null,
        failureCode: null,
        error: null,
        draftSaved: savedDraftRunIds.has(String(run.id)),
         recoveryAction: savedDraftRunIds.has(String(run.id)) && status === "failure"
           ? (run.workflow === "images" ? "image_retry" : "tone_resume")
           : null,
        url: run.html_url,
      };
    }));
    const result = [...enriched, ...fallback]
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit);
    this.automationHistoryCache = { value: result, expiresAt: Date.now() + 30_000 };
    return result;
  }

  async dispatch(workflow: "collect" | "generate" | "rewrite" | "images", inputs: Record<string, string> = {}): Promise<void> {
    await this.github(`/actions/workflows/${workflow}.yml/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: this.config.branch, ...(Object.keys(inputs).length ? { inputs } : {}) }),
    }, true);
    this.workflowRunsCache = null;
    this.automationHistoryCache = null;
    if (workflow === "collect") this.trendSnapshotCache = null;
  }

  async listDrafts(limit = 20, knownRunIds: ReadonlySet<string> = new Set()): Promise<AutomationDraftSummary[]> {
    const tree = await this.tree();
    const statusPaths = tree
      .map((item) => item.path)
      .filter((file) => /^output\/drafts\/\d{4}-\d{2}-\d{2}\/run-\d+\/status\.json$/.test(file))
      .sort((left, right) => right.localeCompare(left))
      .filter((statusPath) => {
        const runId = statusPath.match(/\/run-(\d+)\/status\.json$/)?.[1];
        return runId ? !knownRunIds.has(runId) : false;
      })
      .slice(0, limit);

    return Promise.all(statusPaths.map(async (statusPath) => {
      const basePath = statusPath.slice(0, -"/status.json".length);
      const runId = basePath.match(/run-(\d+)$/)?.[1];
      if (!runId) throw new Error(`원고 실행 ID를 확인할 수 없습니다: ${statusPath}`);
      const [status, article, state] = await Promise.all([
        this.readJson<GeneratedStatus>(statusPath),
        this.readJson<GeneratedArticle>(`${basePath}/article.json`),
        this.readState(runId),
      ]);
      return this.summary(runId, status, article, state);
    }));
  }

  async getDraft(runId: string): Promise<AutomationDraftDetail> {
    const tree = await this.tree();
    const paths = tree.map((item) => item.path);
    const statusPath = paths.find((file) => file.endsWith(`/run-${runId}/status.json`));
    if (!statusPath) throw new Error("원고를 찾을 수 없습니다.");
    const basePath = statusPath.slice(0, -"/status.json".length);
    const revisionStatusPaths = paths
      .filter((file) => file.startsWith(`${basePath}/revisions/v`) && file.endsWith("/status.json"))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const [status, article, articleMarkdown, copyPackage, copyPackageHtml, sourcesMarkdown, evidencePackage, discoveryQuality, advertisingQuality, editorialQuality, nativeKoreanQuality, toneReview, toneAttempts, imageManifest, imageStatus, state] = await Promise.all([
      this.readJson<GeneratedStatus>(statusPath),
      this.readJson<GeneratedArticle>(`${basePath}/article.json`),
      this.readText(`${basePath}/article.md`),
      this.readText(`${basePath}/copy-package.txt`),
      this.readOptionalText(`${basePath}/copy-package.html`),
      this.readText(`${basePath}/sources.md`),
      this.readOptionalJson<GeneratedEvidencePackage>(`${basePath}/evidence-package.json`),
      this.readOptionalJson<GeneratedDiscoveryQuality>(`${basePath}/discovery-quality.json`),
      this.readOptionalJson<GeneratedAdvertisingQuality>(`${basePath}/advertising-quality.json`),
      this.readOptionalJson<GeneratedEditorialQuality>(`${basePath}/editorial-quality.json`),
      this.readOptionalJson<GeneratedNativeKoreanQuality>(`${basePath}/native-korean-quality.json`),
      this.readOptionalJson<GeneratedToneReview>(`${basePath}/tone-review.json`),
      this.readOptionalJson<GeneratedToneAttempts>(`${basePath}/tone-attempts.json`),
      paths.includes(`${basePath}/images/manifest.json`)
        ? this.readOptionalJson<GeneratedImageManifest>(`${basePath}/images/manifest.json`)
        : Promise.resolve(null),
      paths.includes(`${basePath}/images/status.json`)
        ? this.readOptionalJson<GeneratedImageStatus>(`${basePath}/images/status.json`)
        : Promise.resolve(null),
      this.readState(runId),
    ]);
    const revisions = await Promise.all(revisionStatusPaths.map(async (revisionStatusPath) => {
      const revisionBasePath = revisionStatusPath.slice(0, -"/status.json".length);
      const revision = Number(revisionBasePath.match(/\/revisions\/v(\d+)$/)?.[1] ?? 0);
      const [revisionStatus, revisionArticle, revisionMarkdown, revisionCopyPackage] = await Promise.all([
        this.readJson<GeneratedStatus>(revisionStatusPath),
        this.readJson<GeneratedArticle>(`${revisionBasePath}/article.json`),
        this.readText(`${revisionBasePath}/article.md`),
        this.readText(`${revisionBasePath}/copy-package.txt`),
      ]);
      return {
        revision,
        title: revisionArticle.article?.title ?? `Draft ${runId}`,
        articleMarkdown: revisionMarkdown,
        copyPackage: revisionCopyPackage,
        createdAt: revisionStatus.updatedAt ?? revisionStatus.generatedAt ?? status.generatedAt ?? new Date(0).toISOString(),
      };
    }));
    const effectiveArticle = state.manualEdit
      ? { ...article, article: { ...article.article, title: state.manualEdit.title } }
      : article;
    const effectiveMarkdown = state.manualEdit?.body ?? articleMarkdown;
    const effectiveCopyPackage = state.manualEdit?.body ?? copyPackage;
    return {
      ...this.summary(runId, status, effectiveArticle, state),
      articleMarkdown: effectiveMarkdown,
      copyPackage: effectiveCopyPackage,
      copyPackageHtml,
      sourcesMarkdown,
      article: effectiveArticle,
      evidencePackage,
      discoveryQuality,
      advertisingQuality,
      editorialQuality,
      nativeKoreanQuality,
      toneReview,
      toneAttempts,
      imageManifest,
      imageStatus,
      state,
      revisions,
    };
  }

  async editDraft(
    runId: string,
    input: { title: string; body: string; reason?: string | null },
    actor: string,
    currentState?: DashboardDraftState,
  ): Promise<DashboardDraftState> {
    const draft = currentState ? null : await this.getDraft(runId);
    const previousState = currentState ?? draft!.state;
    if (previousState.deletedAt) throw new DomainError("CONTENT_NOT_EDITABLE", "삭제된 원고는 직접 수정할 수 없습니다.", 409);
    if (previousState.publicationStatus !== "none") {
      throw new DomainError("CONTENT_NOT_EDITABLE", "예약·발행된 원고는 직접 수정할 수 없습니다.", 409);
    }
    if (previousState.rewriteStatus === "queued") {
      throw new DomainError("CONTENT_EDIT_CONFLICT", "자동 재작성 중인 원고는 완료 후 수정할 수 있습니다.", 409);
    }
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 5 || body.length < 20) {
      throw new DomainError("INVALID_CONTENT_EDIT", "제목은 5자 이상, 원고는 20자 이상 입력해주세요.", 422);
    }
    const now = new Date().toISOString();
    const baseRevision = previousState.revision ?? draft?.revision ?? 1;
    return this.updateState(runId, {
      reviewStatus: "pending",
      autoApproved: false,
      publicationStatus: "none",
      checks: { sources: false, advertising: false },
      reason: null,
      approvedBy: null,
      rejectedBy: null,
      approvedAt: null,
      rejectedAt: null,
      revision: baseRevision + 1,
      rewriteStatus: null,
      rewriteRequestedAt: null,
      rewrittenAt: null,
      manualEdit: {
        title,
        body,
        reason: input.reason?.trim() || null,
        createdAt: now,
        createdBy: actor,
        baseRevision,
      },
    }, actor, previousState);
  }

  async deleteDraft(
    runId: string,
    actor: string,
    currentState?: DashboardDraftState,
  ): Promise<DashboardDraftState> {
    const draft = currentState ? null : await this.getDraft(runId);
    const previousState = currentState ?? draft!.state;
    if (previousState.deletedAt) throw new DomainError("CONTENT_NOT_DELETABLE", "이미 삭제된 원고입니다.", 409);
    if (previousState.publicationStatus !== "none") {
      throw new DomainError("CONTENT_NOT_DELETABLE", "예약·발행된 원고는 삭제할 수 없습니다.", 409);
    }
    const now = new Date().toISOString();
    return this.updateState(runId, { deletedAt: now, deletedBy: actor }, actor, previousState);
  }

  /**
   * Permanently removes the generated draft directory and its dashboard
   * decision file in one Git commit. This avoids one GitHub Contents API
   * commit per file and keeps deletion fast even when images/revisions exist.
   */
  async deleteDraftPermanently(
    runId: string,
    currentState?: DashboardDraftState,
  ): Promise<{ deletedAt: string; deletedFiles: number }> {
    const previousState = currentState ?? (await this.getDraft(runId)).state;
    if (!/^\d+$/.test(runId)) throw new DomainError("CONTENT_NOT_FOUND", "원고를 찾을 수 없습니다.", 404);
    if (previousState.deletedAt) throw new DomainError("CONTENT_NOT_DELETABLE", "이미 삭제된 원고입니다.", 409);
    if (previousState.publicationStatus !== "none") {
      throw new DomainError("CONTENT_NOT_DELETABLE", "예약·발행된 원고는 삭제할 수 없습니다.", 409);
    }

    const tree = await this.tree();
    const statusPath = tree
      .map((item) => item.path)
      .find((file) => new RegExp(`^output/drafts/\\d{4}-\\d{2}-\\d{2}/run-${runId}/status\\.json$`).test(file));
    if (!statusPath) throw new DomainError("CONTENT_NOT_FOUND", "원고를 찾을 수 없습니다.", 404);
    const draftBasePath = statusPath.slice(0, -"/status.json".length);
    const decisionPath = `dashboard/decisions/run-${runId}.json`;
    const paths = tree
      .map((item) => item.path)
      .filter((path) => path === decisionPath || path.startsWith(`${draftBasePath}/`));
    if (!paths.length) throw new DomainError("CONTENT_NOT_FOUND", "원고 파일을 찾을 수 없습니다.", 404);

    const refName = encodeURIComponent(this.config.branch);
    const ref = await this.github<{ object: { sha: string } }>(`/git/ref/heads/${refName}`);
    const head = await this.github<{ tree: { sha: string } }>(`/git/commits/${encodeURIComponent(ref.object.sha)}`);
    const nextTree = await this.github<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: head.tree.sha,
        tree: paths.map((path) => ({ path, mode: "100644", type: "blob", sha: null })),
      }),
    });
    const commit = await this.github<{ sha: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: `dashboard: permanently delete draft ${runId}`,
        tree: nextTree.sha,
        parents: [ref.object.sha],
      }),
    });
    await this.github(`/git/refs/heads/${refName}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    this.invalidateRepositoryCaches();
    return { deletedAt: new Date().toISOString(), deletedFiles: paths.length };
  }

  async getDraftImage(runId: string, assetId: string, options: { allowFailed?: boolean } = {}): Promise<{ body: Buffer; contentType: string; etag: string }> {
    if (!/^\d+$/.test(runId) || !/^[a-z0-9-]+$/.test(assetId)) {
      throw new DomainError("IMAGE_NOT_FOUND", "이미지 경로가 올바르지 않습니다.", 404);
    }
    const tree = await this.tree();
    const statusPath = tree.map((item) => item.path).find((file) => file.endsWith(`/run-${runId}/status.json`));
    if (!statusPath) throw new DomainError("IMAGE_NOT_FOUND", "원고를 찾을 수 없습니다.", 404);
    const basePath = statusPath.slice(0, -"/status.json".length);
    const manifest = await this.readOptionalJson<GeneratedImageManifest>(`${basePath}/images/manifest.json`);
    // The dashboard may explicitly request a failed candidate for diagnosis.
    // Keep the normal ready-only guard below unchanged for every other caller.
    if (options.allowFailed === true && manifest?.status === "failed") {
      manifest.status = "ready";
    }
    if (manifest?.status !== "ready") throw new DomainError("IMAGE_NOT_FOUND", "품질 검수를 통과한 이미지를 찾을 수 없습니다.", 404);
    const asset = manifest?.assets.find((candidate) => candidate.id === assetId);
    if (!asset || pathHasTraversal(asset.path)) throw new DomainError("IMAGE_NOT_FOUND", "생성된 이미지를 찾을 수 없습니다.", 404);
    const file = await this.file(`${basePath}/images/${asset.path}`);
    if (file.encoding !== "base64") throw new Error(`지원하지 않는 GitHub 파일 인코딩입니다: ${file.encoding}`);
    return {
      body: Buffer.from(file.content.replace(/\s/g, ""), "base64"),
      contentType: imageContentType(asset.path),
      etag: file.sha,
    };
  }

  /** Return ready image ids without loading the complete draft package. */
  async getDraftImageAssetIds(runId: string): Promise<string[]> {
    if (!/^\d+$/.test(runId)) return [];
    const tree = await this.tree();
    const statusPath = tree.map((item) => item.path).find((file) => file.endsWith(`/run-${runId}/status.json`));
    if (!statusPath) return [];
    const basePath = statusPath.slice(0, -"/status.json".length);
    const manifest = await this.readOptionalJson<GeneratedImageManifest>(`${basePath}/images/manifest.json`);
    if (manifest?.status !== "ready") return [];
    return (manifest.assets ?? [])
      .map((asset) => asset.id)
      .filter((assetId) => /^[a-z0-9-]+$/.test(assetId));
  }

  async getTrends(force = false) {
    if (force) this.trendSnapshotCache = null;
    if (this.trendSnapshotCache && this.trendSnapshotCache.expiresAt > Date.now()) {
      return this.mapTrendSnapshot(this.trendSnapshotCache.value);
    }
    if (this.trendSnapshotRequest) {
      const snapshot = await this.trendSnapshotRequest;
      return this.mapTrendSnapshot(snapshot);
    }
    this.trendSnapshotRequest = this.readJson<CollectedTrendSnapshot>("data/latest.json")
      .then((snapshot) => {
        this.trendSnapshotCache = { value: snapshot, expiresAt: Date.now() + this.trendSnapshotCacheTtlMs };
        return snapshot;
      })
      .finally(() => {
        this.trendSnapshotRequest = null;
      });
    return this.mapTrendSnapshot(await this.trendSnapshotRequest);
  }

  private mapTrendSnapshot(snapshot: CollectedTrendSnapshot) {
    const items = (snapshot.items ?? []).map((item) => ({
      title: item.title ?? "제목 없음",
      link: item.link ?? "#",
      description: item.description ?? "",
      bloggername: item.bloggerName ?? "NAVER 블로그",
      postdate: item.postDate ?? "",
      candidateScore: item.candidateScore ?? 0,
      matchedQueries: item.matchedQueries ?? [],
      bestSimilarityRank: item.bestSimilarityRank ?? null,
      bestRecentRank: item.bestRecentRank ?? null,
      observedDays: item.observedDays ?? 1,
      similarityTopDays: item.similarityTopDays ?? 0,
      bestSearchTrend: item.bestSearchTrend ?? null,
      scoreBreakdown: item.scoreBreakdown ?? null,
    }));
    return {
      collectionDate: snapshot.collectionDate ?? "",
      collectedAt: snapshot.collectedAt ?? "",
      queryCount: snapshot.queryCount ?? 0,
      requestCount: snapshot.requestCount ?? 0,
      itemCount: snapshot.itemCount ?? items.length,
      source: snapshot.source ?? "NAVER_SEARCH_BLOG_API",
      collectionStrategy: snapshot.collectionStrategy ?? null,
      unavailableMetrics: snapshot.unavailableMetrics ?? null,
      searchTrend: snapshot.searchTrend ?? null,
      items,
    };
  }

  async updateState(
    runId: string,
    changes: Partial<DashboardDraftState>,
    actor: string,
    currentState?: DashboardDraftState,
  ): Promise<DashboardDraftState> {
    const previousState = currentState ?? (await this.getDraft(runId)).state;
    const state: DashboardDraftState = {
      ...previousState,
      ...changes,
      schemaVersion: 1,
      runId,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    await this.writeJson(
      `dashboard/decisions/run-${runId}.json`,
      state,
      `dashboard: update run ${runId}`,
      previousState,
    );
    return state;
  }

  private summary(runId: string, status: GeneratedStatus, article: GeneratedArticle, state: DashboardDraftState): AutomationDraftSummary {
    const generatedAt = status.generatedAt ?? new Date(0).toISOString();
    const packageUpdatedAt = status.updatedAt ?? generatedAt;
    const updatedAt = Date.parse(state.updatedAt) > Date.parse(packageUpdatedAt) ? state.updatedAt : packageUpdatedAt;
    return {
      runId,
      title: article.article?.title ?? `원고 ${runId}`,
      topic: article.planning?.topic ?? "보험",
      primaryKeyword: article.seo?.primaryKeyword ?? "보험",
      generatedAt,
      pipelineStatus: status.status ?? "UNKNOWN",
      toneSkillApplied: status.toneSkillApplied === true,
      toneVerdict: status.toneVerdict ?? null,
      updatedAt,
      reviewStatus: state.reviewStatus,
      autoApproved: state.autoApproved === true,
      publicationStatus: state.publicationStatus,
      scheduledAt: state.scheduledAt,
      publishedAt: state.publishedAt,
      revision: state.revision ?? status.revision ?? 1,
      rewriteStatus: state.rewriteStatus ?? null,
      imageGenerationStatus: status.imageGenerationStatus ?? state.imageGenerationStatus ?? null,
      imageGenerationWarning: status.imageGenerationWarning ?? state.imageGenerationWarning ?? null,
      deleted: Boolean(state.deletedAt),
    };
  }

  private async readState(runId: string): Promise<DashboardDraftState> {
    const path = `dashboard/decisions/run-${runId}.json`;
    const result = await this.readOptionalJson<DashboardDraftState>(path);
    if (result) return result;
    return defaultState(runId, new Date(0).toISOString());
  }

  private invalidateRepositoryCaches(): void {
    this.repositoryTreeCache = null;
    this.automationHistoryCache = null;
    this.workflowRunsCache = null;
    this.trendSnapshotCache = null;
  }

  private async tree(): Promise<GitHubTreeItem[]> {
    if (this.repositoryTreeCache && this.repositoryTreeCache.expiresAt > Date.now()) {
      return this.repositoryTreeCache.value;
    }
    if (this.repositoryTreeRequest) return this.repositoryTreeRequest;
    this.repositoryTreeRequest = this.loadRepositoryTree().finally(() => {
      this.repositoryTreeRequest = null;
    });
    return this.repositoryTreeRequest;
  }

  private async loadRepositoryTree(): Promise<GitHubTreeItem[]> {
    const payload = await this.github<{ tree: GitHubTreeItem[]; truncated: boolean }>(
      `/git/trees/${encodeURIComponent(this.config.branch)}?recursive=1`,
    );
    if (payload.truncated) throw new Error("비공개 레포 파일 목록이 너무 커서 원고 목록을 완전히 읽지 못했습니다.");
    const value = payload.tree.filter((item) => item.type === "blob");
    this.repositoryTreeCache = { value, expiresAt: Date.now() + this.repositoryTreeCacheTtlMs };
    return value;
  }

  private async readOptionalText(path: string): Promise<string | null> {
    const response = await this.raw(`/contents/${encodeRepositoryPath(path)}?ref=${encodeURIComponent(this.config.branch)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await this.githubError(response);
    const file = await response.json() as GitHubFileResponse;
    if (file.encoding !== "base64") throw new Error(`GitHub file has unsupported encoding: ${file.encoding}`);
    return Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
  }

  private async readText(path: string): Promise<string> {
    try {
      const file = await this.file(path);
      // GitHub returns `encoding: none` with an empty `content` field for
      // files larger than 1 MB. Read that object through the Blob API instead
      // of treating a successful metadata response as an unsupported file.
      if (file.encoding === "none") return this.readBlobText(path);
      if (file.encoding !== "base64") throw new Error(`지원하지 않는 GitHub 파일 인코딩입니다: ${file.encoding}`);
      return Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
    } catch (error) {
      // GitHub's Contents API refuses files larger than 1 MB. Trend snapshots
      // can exceed that limit as the candidate history grows, so fall back to
      // the Git Blob API, which returns the complete blob by SHA.
      if (!isLargeGitHubFileError(error)) throw error;
      return this.readBlobText(path);
    }
  }

  private async readBlobText(path: string): Promise<string> {
    const entry = (await this.tree()).find((item) => item.path === path && item.type === "blob");
    if (!entry?.sha) throw new Error(`GitHub 파일 SHA를 확인할 수 없습니다: ${path}`);
    const blob = await this.github<{ content: string; encoding: string }>(`/git/blobs/${encodeURIComponent(entry.sha)}`);
    if (blob.encoding !== "base64") throw new Error(`지원하지 않는 GitHub Blob 인코딩입니다: ${blob.encoding}`);
    return Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8");
  }

  private async readJson<T = unknown>(path: string): Promise<T> {
    return JSON.parse(await this.readText(path)) as T;
  }

  private async readOptionalJson<T>(path: string): Promise<T | null> {
    const response = await this.raw(`/contents/${encodeRepositoryPath(path)}?ref=${encodeURIComponent(this.config.branch)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await this.githubError(response);
    const file = await response.json() as GitHubFileResponse;
    return JSON.parse(Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8")) as T;
  }

  private async file(path: string): Promise<GitHubFileResponse> {
    return this.github(`/contents/${encodeRepositoryPath(path)}?ref=${encodeURIComponent(this.config.branch)}`);
  }

  private stateConflict(): DomainError {
    return new DomainError(
      "CONTENT_STATE_CONFLICT",
      "다른 검수 작업이 먼저 처리되었습니다. 최신 상태를 불러온 뒤 다시 확인해주세요.",
      409,
    );
  }

  private sameStateRevision(left: DashboardDraftState, right: DashboardDraftState): boolean {
    return left.runId === right.runId
      && left.updatedAt === right.updatedAt
      && left.reviewStatus === right.reviewStatus
      && left.publicationStatus === right.publicationStatus
      && (left.revision ?? 1) === (right.revision ?? 1)
      && (left.deletedAt ?? null) === (right.deletedAt ?? null);
  }

  private async writeJson(
    path: string,
    value: unknown,
    message: string,
    expectedState?: DashboardDraftState,
  ): Promise<void> {
    const existing = await this.raw(`/contents/${encodeRepositoryPath(path)}?ref=${encodeURIComponent(this.config.branch)}`);
    let sha: string | undefined;
    if (existing.ok) {
      const file = (await existing.json()) as GitHubFileResponse;
      sha = file.sha;
      if (expectedState) {
        const currentState = JSON.parse(
          Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8"),
        ) as DashboardDraftState;
        if (!this.sameStateRevision(currentState, expectedState)) throw this.stateConflict();
      }
    } else if (existing.status === 404) {
      if (expectedState && (expectedState.reviewStatus !== "pending" || expectedState.publicationStatus !== "none")) {
        throw this.stateConflict();
      }
    } else {
      throw await this.githubError(existing);
    }

    const response = await this.raw(`/contents/${encodeRepositoryPath(path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        branch: this.config.branch,
        content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    });
    if (response.status === 409 || response.status === 422) throw this.stateConflict();
    if (!response.ok) throw await this.githubError(response);
    this.invalidateRepositoryCaches();
  }

  private async failedStep(runId: number): Promise<string | null> {
    try {
      const payload = await this.github<GitHubJobsResponse>(`/actions/runs/${runId}/jobs?filter=latest&per_page=20`);
      const failedJob = payload.jobs.find((job) => job.conclusion === "failure");
      const failedStep = failedJob?.steps?.find((step) => step.conclusion === "failure");
      return failedStep?.name ?? failedJob?.name ?? null;
    } catch {
      return null;
    }
  }

  private async commitFiles(files: Record<string, string>, message: string): Promise<void> {
    const refName = encodeURIComponent(this.config.branch);
    const ref = await this.github<{ object: { sha: string } }>(`/git/ref/heads/${refName}`);
    const head = await this.github<{ tree: { sha: string } }>(`/git/commits/${encodeURIComponent(ref.object.sha)}`);
    const blobs = await Promise.all(Object.entries(files).map(async ([filePath, content]) => {
      const blob = await this.github<{ sha: string }>("/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content, encoding: "utf-8" }),
      });
      return { path: filePath, mode: "100644", type: "blob", sha: blob.sha };
    }));
    const nextTree = await this.github<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: head.tree.sha, tree: blobs }),
    });
    const commit = await this.github<{ sha: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message, tree: nextTree.sha, parents: [ref.object.sha] }),
    });
    await this.github(`/git/refs/heads/${refName}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    this.invalidateRepositoryCaches();
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    return this.request(`${apiBase}/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repository)}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
        "User-Agent": "naverblog-dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
  }

  private async github<T = unknown>(path: string, init: RequestInit = {}, allowEmpty = false): Promise<T> {
    const response = await this.raw(path, init);
    if (!response.ok) throw await this.githubError(response);
    if (allowEmpty || response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private async githubError(response: Response): Promise<Error> {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    return new Error(`GitHub 자동화 요청 실패 (${response.status}): ${payload?.message ?? response.statusText}`);
  }
}
