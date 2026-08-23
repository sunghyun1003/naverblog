export interface GitHubAutomationConfig {
  owner: string;
  repository: string;
  branch: string;
  token: string;
}

export type DashboardReviewStatus = "pending" | "approved" | "rejected";
export type DashboardPublicationStatus = "none" | "scheduled" | "published";

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
  updatedAt: string;
  reviewStatus: DashboardReviewStatus;
  publicationStatus: DashboardPublicationStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
}

export interface AutomationDraftDetail extends AutomationDraftSummary {
  articleMarkdown: string;
  copyPackage: string;
  sourcesMarkdown: string;
  article: GeneratedArticle;
  state: DashboardDraftState;
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

interface GeneratedArticle {
  planning?: { topic?: string };
  seo?: { primaryKeyword?: string };
  article?: { title?: string };
  factChecks?: Array<{ claim?: string; status?: string; verificationNote?: string }>;
  sources?: Array<{ title?: string; url?: string; usedFor?: string }>;
}

interface GeneratedStatus {
  generatedAt?: string;
  status?: string;
  toneSkillApplied?: boolean;
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
  itemCount?: number;
  items?: Array<{
    title?: string;
    link?: string;
    description?: string;
    bloggerName?: string;
    postDate?: string;
    candidateScore?: number;
    matchedQueries?: string[];
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

  async dispatch(workflow: "collect" | "generate", inputs: Record<string, string> = {}): Promise<void> {
    await this.github(`/actions/workflows/${workflow}.yml/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: this.config.branch, ...(Object.keys(inputs).length ? { inputs } : {}) }),
    }, true);
  }

  async listDrafts(limit = 20): Promise<AutomationDraftSummary[]> {
    const tree = await this.tree();
    const statusPaths = tree
      .map((item) => item.path)
      .filter((file) => /^output\/drafts\/\d{4}-\d{2}-\d{2}\/run-\d+\/status\.json$/.test(file))
      .sort((left, right) => right.localeCompare(left))
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
    const statusPath = tree.map((item) => item.path).find((file) => file.endsWith(`/run-${runId}/status.json`));
    if (!statusPath) throw new Error("원고를 찾을 수 없습니다.");
    const basePath = statusPath.slice(0, -"/status.json".length);
    const [status, article, articleMarkdown, copyPackage, sourcesMarkdown, state] = await Promise.all([
      this.readJson<GeneratedStatus>(statusPath),
      this.readJson<GeneratedArticle>(`${basePath}/article.json`),
      this.readText(`${basePath}/article.md`),
      this.readText(`${basePath}/copy-package.txt`),
      this.readText(`${basePath}/sources.md`),
      this.readState(runId),
    ]);
    return { ...this.summary(runId, status, article, state), articleMarkdown, copyPackage, sourcesMarkdown, article, state };
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
    }));
    return {
      collectionDate: snapshot.collectionDate ?? "",
      collectedAt: snapshot.collectedAt ?? "",
      queryCount: snapshot.queryCount ?? 0,
      itemCount: snapshot.itemCount ?? items.length,
      source: snapshot.source ?? "NAVER_SEARCH_BLOG_API",
      items,
    };
  }

  async updateState(runId: string, changes: Partial<DashboardDraftState>, actor: string): Promise<DashboardDraftState> {
    const draft = await this.getDraft(runId);
    const state: DashboardDraftState = {
      ...draft.state,
      ...changes,
      schemaVersion: 1,
      runId,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    await this.writeJson(`dashboard/decisions/run-${runId}.json`, state, `dashboard: update run ${runId}`);
    return state;
  }

  private summary(runId: string, status: GeneratedStatus, article: GeneratedArticle, state: DashboardDraftState): AutomationDraftSummary {
    const generatedAt = status.generatedAt ?? new Date(0).toISOString();
    const updatedAt = Date.parse(state.updatedAt) > Date.parse(generatedAt) ? state.updatedAt : generatedAt;
    return {
      runId,
      title: article.article?.title ?? `원고 ${runId}`,
      topic: article.planning?.topic ?? "보험",
      primaryKeyword: article.seo?.primaryKeyword ?? "보험",
      generatedAt,
      pipelineStatus: status.status ?? "UNKNOWN",
      toneSkillApplied: status.toneSkillApplied === true,
      updatedAt,
      reviewStatus: state.reviewStatus,
      publicationStatus: state.publicationStatus,
      scheduledAt: state.scheduledAt,
      publishedAt: state.publishedAt,
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

  private async writeJson(path: string, value: unknown, message: string): Promise<void> {
    const existing = await this.raw(`/contents/${encodeRepositoryPath(path)}?ref=${encodeURIComponent(this.config.branch)}`);
    let sha: string | undefined;
    if (existing.ok) sha = ((await existing.json()) as GitHubFileResponse).sha;
    else if (existing.status !== 404) throw await this.githubError(existing);

    await this.github(`/contents/${encodeRepositoryPath(path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        branch: this.config.branch,
        content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8").toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    });
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
