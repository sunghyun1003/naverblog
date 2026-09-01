import type { ApiAutomationHistoryItem, ApiAutomationSettings, ApiCapabilities, ApiContent, ApiContentDetail, ApiContentList, ApiJob, ApiTrendItem, ApiTrendSnapshot, ApiUser, ApiWorkflowRun } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const fallbackDate = "1970-01-01T00:00:00.000Z";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asDateString(value: unknown, fallback = fallbackDate): string {
  const candidate = asString(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : fallback;
}

function asOptionalDateString(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

const contentStates: ApiContent["state"][] = [
  "idea", "researching", "brief_ready", "drafting", "review_ready", "approved", "scheduled", "published", "measured", "deleted",
];

function normalizeContent(value: unknown, index: number): ApiContent | null {
  if (!isRecord(value)) return null;
  const state = contentStates.includes(value.state as ApiContent["state"]) ? value.state as ApiContent["state"] : "idea";
  const strategy = value.strategy === "original" ? "original" : "trend";
  return {
    id: asString(value.id, `content-${index}`),
    creationKey: asString(value.creationKey, `content-${index}`),
    title: asString(value.title, "제목 없음"),
    topic: asString(value.topic, asString(value.title, "")),
    strategy,
    state,
    assigneeId: typeof value.assigneeId === "string" ? value.assigneeId : null,
    createdBy: asString(value.createdBy, "system"),
    createdAt: asDateString(value.createdAt),
    updatedAt: asDateString(value.updatedAt),
    scheduledAt: asOptionalDateString(value.scheduledAt),
    publishedAt: asOptionalDateString(value.publishedAt),
    mirrorSynced: typeof value.mirrorSynced === "boolean" ? value.mirrorSynced : undefined,
    imagesQueued: typeof value.imagesQueued === "boolean" ? value.imagesQueued : undefined,
    rewriteQueued: typeof value.rewriteQueued === "boolean" ? value.rewriteQueued : undefined,
    rewriteStatus: ["queued", "completed", "failed"].includes(value.rewriteStatus as string) ? value.rewriteStatus as ApiContent["rewriteStatus"] : null,
    imageGenerationStatus: ["queued", "ready", "failed"].includes(value.imageGenerationStatus as string) ? value.imageGenerationStatus as ApiContent["imageGenerationStatus"] : null,
    imageGenerationWarning: typeof value.imageGenerationWarning === "string" ? value.imageGenerationWarning : null,
  };
}

function normalizeTrendItem(value: unknown, index: number): ApiTrendItem | null {
  if (!isRecord(value)) return null;
  const searchTrend = isRecord(value.bestSearchTrend) ? value.bestSearchTrend : null;
  const breakdown = isRecord(value.scoreBreakdown) ? value.scoreBreakdown : null;
  return {
    title: asString(value.title, "제목 없음"),
    link: asString(value.link, `#trend-${index}`),
    description: asString(value.description),
    bloggername: asString(value.bloggername),
    postdate: asString(value.postdate),
    candidateScore: asNumber(value.candidateScore),
    matchedQueries: asStringArray(value.matchedQueries),
    bestSimilarityRank: typeof value.bestSimilarityRank === "number" ? value.bestSimilarityRank : null,
    bestRecentRank: typeof value.bestRecentRank === "number" ? value.bestRecentRank : null,
    observedDays: asNumber(value.observedDays, 1),
    similarityTopDays: asNumber(value.similarityTopDays),
    bestSearchTrend: searchTrend ? {
      query: asString(searchTrend.query),
      category: asString(searchTrend.category),
      baselineAverage: typeof searchTrend.baselineAverage === "number" ? searchTrend.baselineAverage : null,
      recentAverage: typeof searchTrend.recentAverage === "number" ? searchTrend.recentAverage : null,
      direction: ["rising", "stable", "falling", "insufficient"].includes(searchTrend.direction as string) ? searchTrend.direction as "rising" | "stable" | "falling" | "insufficient" : "insufficient",
      changePercent: typeof searchTrend.changePercent === "number" ? searchTrend.changePercent : null,
      momentumScore: typeof searchTrend.momentumScore === "number" ? searchTrend.momentumScore : undefined,
    } : null,
    scoreBreakdown: breakdown ? {
      total: asNumber(breakdown.total),
      freshness: asNumber(breakdown.freshness),
      similarityRank: asNumber(breakdown.similarityRank),
      keywordRelevance: asNumber(breakdown.keywordRelevance),
      relativeDemand: asNumber(breakdown.relativeDemand),
      trendMomentum: asNumber(breakdown.trendMomentum),
      fourWeekPersistence: asNumber(breakdown.fourWeekPersistence),
      intentFit: asNumber(breakdown.intentFit),
    } : null,
  };
}

function normalizeWorkflowRun(value: unknown, index: number): ApiWorkflowRun | null {
  if (!isRecord(value)) return null;
  return {
    id: asNumber(value.id, index),
    workflow: ["collect", "generate", "images", "rewrite"].includes(value.workflow as string) ? value.workflow as ApiWorkflowRun["workflow"] : "collect",
    status: asString(value.status, "unknown"),
    conclusion: typeof value.conclusion === "string" ? value.conclusion : null,
    createdAt: asDateString(value.createdAt),
    updatedAt: asString(value.updatedAt, fallbackDate),
    url: asString(value.url),
  };
}

function normalizeHistoryItem(value: unknown, index: number): ApiAutomationHistoryItem | null {
  if (!isRecord(value)) return null;
  const codex = isRecord(value.codex) ? value.codex : {};
  return {
    id: asString(value.id, `history-${index}`),
    workflowRunId: asNumber(value.workflowRunId),
    workflow: ["collect", "generate", "images", "rewrite"].includes(value.workflow as string) ? value.workflow as ApiAutomationHistoryItem["workflow"] : "collect",
    job: asString(value.job),
    event: asString(value.event),
    status: ["success", "failure", "cancelled", "running", "queued", "skipped"].includes(value.status as string) ? value.status as ApiAutomationHistoryItem["status"] : "failure",
    startedAt: asDateString(value.startedAt),
    finishedAt: asOptionalDateString(value.finishedAt),
    durationSeconds: typeof value.durationSeconds === "number" ? value.durationSeconds : null,
    contentRunId: typeof value.contentRunId === "string" ? value.contentRunId : null,
    contentTitle: typeof value.contentTitle === "string" ? value.contentTitle : null,
    codex: {
      calls: asNumber(codex.calls),
      inputTokens: asNumber(codex.inputTokens),
      cachedInputTokens: asNumber(codex.cachedInputTokens),
      outputTokens: asNumber(codex.outputTokens),
      totalTokens: asNumber(codex.totalTokens),
      promptChars: asNumber(codex.promptChars),
      estimatedPromptTokens: asNumber(codex.estimatedPromptTokens),
    },
    failedStage: typeof value.failedStage === "string" ? value.failedStage : null,
    failureCode: typeof value.failureCode === "string" ? value.failureCode : null,
    error: typeof value.error === "string" ? value.error : null,
    draftSaved: value.draftSaved === true,
    recoveryAction: value.recoveryAction === "tone_resume" ? "tone_resume" : null,
    url: asString(value.url),
  };
}

const automationFrequencies: ApiAutomationSettings["collection"]["frequency"][] = ["daily", "weekdays", "weekly"];

function normalizeSchedule(value: unknown, fallback: ApiAutomationSettings["collection"]): ApiAutomationSettings["collection"] {
  if (!isRecord(value)) return fallback;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    frequency: automationFrequencies.includes(value.frequency as ApiAutomationSettings["collection"]["frequency"])
      ? value.frequency as ApiAutomationSettings["collection"]["frequency"] : fallback.frequency,
    time: /^([01]\\d|2[0-3]):[0-5]\\d$/.test(asString(value.time)) ? asString(value.time) : fallback.time,
    weekday: Number.isInteger(value.weekday) && Number(value.weekday) >= 0 && Number(value.weekday) <= 6 ? Number(value.weekday) : fallback.weekday,
  };
}

function normalizeAutomationSettings(value: unknown): ApiAutomationSettings | null {
  if (!isRecord(value)) return null;
  const defaults: ApiAutomationSettings = {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    collection: { enabled: true, frequency: "daily", time: "06:30", weekday: 1 },
    generation: { enabled: true, frequency: "daily", time: "07:00", weekday: 1, count: 1 },
  };
  const collection = normalizeSchedule(value.collection, defaults.collection);
  const generationBase = normalizeSchedule(value.generation, defaults.generation);
  const count = isRecord(value.generation) && Number.isInteger(value.generation.count) && Number(value.generation.count) >= 1 && Number(value.generation.count) <= 3
    ? Number(value.generation.count) : defaults.generation.count;
  return {
    schemaVersion: 1,
    timezone: "Asia/Seoul",
    collection,
    generation: { ...generationBase, count },
  };
}

function normalizeContentVersion(value: unknown, index: number): ApiContentDetail["versions"][number] | null {
  if (!isRecord(value)) return null;
  const stages: ApiContentDetail["versions"][number]["stage"][] = ["brief", "draft", "seo", "geo", "human_tone", "manual"];
  return {
    id: asString(value.id, `version-${index}`),
    sequence: asNumber(value.sequence, index + 1),
    stage: stages.includes(value.stage as ApiContentDetail["versions"][number]["stage"]) ? value.stage as ApiContentDetail["versions"][number]["stage"] : "draft",
    title: asString(value.title, "제목 없음"),
    body: asString(value.body),
    metadata: isRecord(value.metadata) ? value.metadata : {},
    createdAt: asString(value.createdAt, fallbackDate),
  };
}

function normalizeContentDetail(value: unknown): ApiContentDetail {
  const source = isRecord(value) ? value : {};
  const content = normalizeContent(source.content, 0) ?? normalizeContent({}, 0)!;
  const versions = Array.isArray(source.versions) ? source.versions.map(normalizeContentVersion).filter((item): item is ApiContentDetail["versions"][number] => item !== null) : [];
  const qualityResults = Array.isArray(source.qualityResults) ? source.qualityResults.filter(isRecord).map((item, index) => ({
    id: asString(item.id, `quality-${index}`),
    category: ["facts", "seo", "geo", "tone", "native_korean", "advertising", "editorial"].includes(item.category as string) ? item.category as ApiContentDetail["qualityResults"][number]["category"] : "editorial",
    status: ["passed", "warning", "failed"].includes(item.status as string) ? item.status as ApiContentDetail["qualityResults"][number]["status"] : "warning",
    score: asNumber(item.score),
    messages: asStringArray(item.messages),
  })) : [];
  const jobs = Array.isArray(source.jobs) ? source.jobs.filter(isRecord).map((item, index) => ({
    id: asString(item.id, `job-${index}`),
    contentId: asString(item.contentId, content.id),
    status: ["queued", "running", "succeeded", "failed"].includes(item.status as string) ? item.status as ApiJob["status"] : "failed",
    steps: Array.isArray(item.steps) ? item.steps.filter(isRecord).map((step) => ({
      stage: asString(step.stage),
      status: ["pending", "running", "succeeded", "failed"].includes(step.status as string) ? step.status as ApiJob["steps"][number]["status"] : "failed",
      startedAt: typeof step.startedAt === "string" ? step.startedAt : null,
      completedAt: typeof step.completedAt === "string" ? step.completedAt : null,
      outputVersionId: typeof step.outputVersionId === "string" ? step.outputVersionId : null,
      error: typeof step.error === "string" ? step.error : null,
    })) : [],
    error: typeof item.error === "string" ? item.error : null,
  })) : [];
  return {
    content,
    automation: isRecord(source.automation) ? source.automation as ApiContentDetail["automation"] : undefined,
    versions,
    sources: Array.isArray(source.sources) ? source.sources.filter(isRecord) as unknown as ApiContentDetail["sources"] : [],
    claims: Array.isArray(source.claims) ? source.claims.filter(isRecord) as unknown as ApiContentDetail["claims"] : [],
    qualityResults,
    jobs,
    approvals: Array.isArray(source.approvals) ? source.approvals : [],
    publications: Array.isArray(source.publications) ? source.publications : [],
    auditEvents: Array.isArray(source.auditEvents) ? source.auditEvents.filter(isRecord).map((item, index) => ({ id: asString(item.id, `audit-${index}`), action: asString(item.action), createdAt: asString(item.createdAt, fallbackDate) })) : [],
    freshness: isRecord(source.freshness) ? source.freshness as unknown as ApiContentDetail["freshness"] : undefined,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.method && init.method !== "GET" ? { "X-Requested-With": "dashboard" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(payload?.error?.message ?? "API 요청에 실패했습니다.", response.status, payload?.error?.code ?? "UNKNOWN");
  }
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("서버 응답을 읽지 못했습니다.", response.status, "INVALID_RESPONSE");
  }
}

export function getSession(signal?: AbortSignal): Promise<{ user: ApiUser }> {
  return request("/api/auth/session", { signal });
}

export function login(username: string, password: string): Promise<{ user: ApiUser }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<void> {
  return request("/api/auth/logout", { method: "POST" });
}

export async function listContents(signal?: AbortSignal, refresh = false): Promise<ApiContentList> {
  const payload = await request<unknown>(`/api/contents${refresh ? "?refresh=true" : ""}`, { signal });
  if (!isRecord(payload)) return { items: [] };
  const items = Array.isArray(payload.items) ? payload.items.map(normalizeContent).filter((item): item is ApiContent => item !== null) : [];
  return { items, freshness: isRecord(payload.freshness) ? payload.freshness as unknown as ApiContentList["freshness"] : undefined };
}

export function getCapabilities(signal?: AbortSignal): Promise<ApiCapabilities> {
  return request("/api/system/capabilities", { signal });
}

export async function getContentDetail(contentId: string, signal?: AbortSignal, refresh = false): Promise<ApiContentDetail> {
  const payload = await request<unknown>(`/api/contents/${encodeURIComponent(contentId)}${refresh ? "?refresh=true" : ""}`, { signal });
  return normalizeContentDetail(payload);
}

export function createContent(input: { title: string; topic: string; strategy: "trend" | "original" }): Promise<ApiContent> {
  return request("/api/contents", {
    method: "POST",
    headers: { "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

export function runPipeline(contentId: string): Promise<ApiJob> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/pipeline`, {
    method: "POST",
    headers: { "X-Idempotency-Key": crypto.randomUUID() },
  });
}

export function approveContent(
  contentId: string,
  checks: { sources: boolean; advertising: boolean },
): Promise<ApiContent> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ checks }),
  });
}

export function rejectContent(contentId: string, reason: string): Promise<ApiContent> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Resume only the saved tone-review cycle; this does not regenerate research or the article. */
export function resumeToneReview(contentId: string): Promise<ApiContent> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/tone-resume`, { method: "POST" });
}

export function editContent(
  contentId: string,
  input: { title: string; body: string; reason?: string | null },
): Promise<ApiContent> {
  return request(`/api/contents/${encodeURIComponent(contentId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteContent(contentId: string): Promise<ApiContent> {
  return request(`/api/contents/${encodeURIComponent(contentId)}`, { method: "DELETE" });
}

export function deleteContents(contentIds: string[]): Promise<{
  items: Array<ApiContent & { mirrorSynced?: boolean; deletedFiles?: number }>;
  failures: Array<{ id: string; message: string }>;
}> {
  return request("/api/contents/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids: contentIds }),
  });
}

export function generateContentImages(contentId: string, input?: { assetId?: string; feedback?: string }): Promise<{ accepted: boolean }> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/images/generate`, {
    method: "POST",
    body: input ? JSON.stringify(input) : undefined,
  });
}

export function contentImageUrl(contentId: string, assetId: string, version?: string): string {
  const base = `${apiBaseUrl}/api/contents/${encodeURIComponent(contentId)}/images/${encodeURIComponent(assetId)}`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}

export function getContentCopyAssets(contentId: string): Promise<{ expiresAt: string; items: Array<{ assetId: string; url: string }> }> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/copy-assets`);
}

export function collectTrends(): Promise<{ accepted: boolean }> {
  return request("/api/automation/collect", { method: "POST" });
}

export function generateContent(topic: string, strategy: "trend" | "original"): Promise<{ accepted: boolean }> {
  return request("/api/automation/generate", {
    method: "POST",
    body: JSON.stringify({ topic, strategy }),
  });
}

export async function listWorkflowRuns(signal?: AbortSignal): Promise<{ items: ApiWorkflowRun[] }> {
  const payload = await request<unknown>("/api/automation/runs", { signal });
  return { items: isRecord(payload) && Array.isArray(payload.items) ? payload.items.map(normalizeWorkflowRun).filter((item): item is ApiWorkflowRun => item !== null) : [] };
}

export async function listAutomationHistory(signal?: AbortSignal): Promise<{ items: ApiAutomationHistoryItem[] }> {
  const payload = await request<unknown>("/api/automation/history", { signal });
  return { items: isRecord(payload) && Array.isArray(payload.items) ? payload.items.map(normalizeHistoryItem).filter((item): item is ApiAutomationHistoryItem => item !== null) : [] };
}

export async function getAutomationSettings(signal?: AbortSignal): Promise<{ settings: ApiAutomationSettings | null }> {
  const payload = await request<unknown>("/api/automation/settings", { signal });
  return { settings: isRecord(payload) ? normalizeAutomationSettings(payload.settings) : null };
}

export async function updateAutomationSettings(settings: ApiAutomationSettings): Promise<{ settings: ApiAutomationSettings }> {
  const payload = await request<unknown>("/api/automation/settings", { method: "PUT", body: JSON.stringify(settings) });
  return { settings: normalizeAutomationSettings(isRecord(payload) ? payload.settings : null) ?? settings };
}

export async function getTrends(signal?: AbortSignal, refresh = false): Promise<ApiTrendSnapshot> {
  const payload = await request<unknown>(`/api/trends${refresh ? "?refresh=true" : ""}`, { signal });
  if (!isRecord(payload)) {
    return { collectionDate: "", collectedAt: fallbackDate, queryCount: 0, itemCount: 0, source: "unknown", items: [] };
  }
  const items = Array.isArray(payload.items) ? payload.items.map(normalizeTrendItem).filter((item): item is ApiTrendItem => item !== null) : [];
  return {
    collectionDate: asString(payload.collectionDate),
    collectedAt: asDateString(payload.collectedAt),
    queryCount: asNumber(payload.queryCount),
    requestCount: typeof payload.requestCount === "number" ? payload.requestCount : undefined,
    itemCount: asNumber(payload.itemCount, items.length),
    source: asString(payload.source, "unknown"),
    collectionStrategy: isRecord(payload.collectionStrategy) ? payload.collectionStrategy as ApiTrendSnapshot["collectionStrategy"] : null,
    unavailableMetrics: isRecord(payload.unavailableMetrics) ? payload.unavailableMetrics as Record<string, string> : null,
    searchTrend: isRecord(payload.searchTrend) ? payload.searchTrend as ApiTrendSnapshot["searchTrend"] : null,
    items,
  };
}

export function scheduleContent(contentId: string, scheduledAt: string): Promise<{ mirrorSynced?: boolean }> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduledAt }),
  });
}

export function markContentPublished(contentId: string, externalUrl: string): Promise<{ mirrorSynced?: boolean }> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/publish`, {
    method: "POST",
    body: JSON.stringify({ externalUrl }),
  });
}
