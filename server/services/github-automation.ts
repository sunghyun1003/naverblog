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
  rewriteStatus?: DashboardRewriteStatus;
  rewriteRequestedAt?: string | null;
  rewrittenAt?: string | null;
  decisionHistory?: DashboardDecisionEvent[];
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
  publicationStatus: DashboardPublicationStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  revision?: number;
  rewriteStatus?: DashboardRewriteStatus | null;
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
  sourcesMarkdown: string;
  article: GeneratedArticle;
  evidencePackage?: GeneratedEvidencePackage | null;
  discoveryQuality?: GeneratedDiscoveryQuality | null;
  advertisingQuality?: GeneratedAdvertisingQuality | null;
  toneReview?: GeneratedToneReview | null;
  toneAttempts?: GeneratedToneAttempts | null;
  state: DashboardDraftState;
  revisions?: AutomationDraftRevision[];
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

export interface WorkflowRunSummary {
  id: number;
  workflow: "collect" | "generate";
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
}

interface GitHubFileResponse {
  content: string;
  encoding: string;
  sha: string;
}

export interface GeneratedArticle {
  planning?: { topic?: string };
  seo?: { primaryKeyword?: string };
  article?: { title?: string };
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
}

interface WorkflowRunsResponse {
  workflow_runs: Array<{
    id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    updated_at: string;
    html_url: string;
  }>;
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
      freshness?: number;
      queryBreadth?: number;
      similarityRank?: number;
      persistence?: number;
      searchTrend?: number;
    };
  }>;
}

type Fetcher = typeof fetch;

const apiBase = "https://api.github.com";

function encodeRepositoryPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
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
  constructor(private readonly config: GitHubAutomationConfig, private readonly request: Fetcher = fetch) {}

  async capabilities() {
    const runs = await this.listWorkflowRuns();
    return {
      mode: "github-actions",
      repository: `${this.config.owner}/${this.config.repository}`,
      branch: this.config.branch,
      latestCollectionRun: runs.find((run) => run.workflow === "collect") ?? null,
      latestGenerationRun: runs.find((run) => run.workflow === "generate") ?? null,
    };
  }

  async listWorkflowRuns(): Promise<WorkflowRunSummary[]> {
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
    return responses.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async dispatch(workflow: "collect" | "generate" | "rewrite", inputs: Record<string, string> = {}): Promise<void> {
    await this.github(`/actions/workflows/${workflow}.yml/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: this.config.branch, ...(Object.keys(inputs).length ? { inputs } : {}) }),
    }, true);
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
    const [status, article, articleMarkdown, copyPackage, sourcesMarkdown, evidencePackage, discoveryQuality, advertisingQuality, toneReview, toneAttempts, state] = await Promise.all([
      this.readJson<GeneratedStatus>(statusPath),
      this.readJson<GeneratedArticle>(`${basePath}/article.json`),
      this.readText(`${basePath}/article.md`),
      this.readText(`${basePath}/copy-package.txt`),
      this.readText(`${basePath}/sources.md`),
      this.readOptionalJson<GeneratedEvidencePackage>(`${basePath}/evidence-package.json`),
      this.readOptionalJson<GeneratedDiscoveryQuality>(`${basePath}/discovery-quality.json`),
      this.readOptionalJson<GeneratedAdvertisingQuality>(`${basePath}/advertising-quality.json`),
      this.readOptionalJson<GeneratedToneReview>(`${basePath}/tone-review.json`),
      this.readOptionalJson<GeneratedToneAttempts>(`${basePath}/tone-attempts.json`),
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
    return { ...this.summary(runId, status, article, state), articleMarkdown, copyPackage, sourcesMarkdown, article, evidencePackage, discoveryQuality, advertisingQuality, toneReview, toneAttempts, state, revisions };
  }

  async getTrends() {
    const snapshot = await this.readJson<CollectedTrendSnapshot>("data/latest.json");
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
      publicationStatus: state.publicationStatus,
      scheduledAt: state.scheduledAt,
      publishedAt: state.publishedAt,
      revision: state.revision ?? status.revision ?? 1,
      rewriteStatus: state.rewriteStatus ?? null,
    };
  }

  private async readState(runId: string): Promise<DashboardDraftState> {
    const path = `dashboard/decisions/run-${runId}.json`;
    const result = await this.readOptionalJson<DashboardDraftState>(path);
    if (result) return result;
    return defaultState(runId, new Date(0).toISOString());
  }

  private async tree(): Promise<GitHubTreeItem[]> {
    const payload = await this.github<{ tree: GitHubTreeItem[]; truncated: boolean }>(
      `/git/trees/${encodeURIComponent(this.config.branch)}?recursive=1`,
    );
    if (payload.truncated) throw new Error("비공개 레포 파일 목록이 너무 커서 원고 목록을 완전히 읽지 못했습니다.");
    return payload.tree.filter((item) => item.type === "blob");
  }

  private async readText(path: string): Promise<string> {
    const file = await this.file(path);
    if (file.encoding !== "base64") throw new Error(`지원하지 않는 GitHub 파일 인코딩입니다: ${file.encoding}`);
    return Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
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
      && left.publicationStatus === right.publicationStatus;
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
