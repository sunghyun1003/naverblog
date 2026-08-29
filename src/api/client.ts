import type { ApiCapabilities, ApiContent, ApiContentDetail, ApiContentList, ApiJob, ApiTrendSnapshot, ApiUser, ApiWorkflowRun } from "./types";

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
  return response.json() as Promise<T>;
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

export function listContents(signal?: AbortSignal, refresh = false): Promise<ApiContentList> {
  return request(`/api/contents${refresh ? "?refresh=true" : ""}`, { signal });
}

export function getCapabilities(signal?: AbortSignal): Promise<ApiCapabilities> {
  return request("/api/system/capabilities", { signal });
}

export function getContentDetail(contentId: string, signal?: AbortSignal): Promise<ApiContentDetail> {
  return request(`/api/contents/${encodeURIComponent(contentId)}?refresh=true`, { signal });
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

export function generateContentImages(contentId: string): Promise<{ accepted: boolean }> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/images/generate`, { method: "POST" });
}

export function contentImageUrl(contentId: string, assetId: string, version?: string): string {
  const base = `${apiBaseUrl}/api/contents/${encodeURIComponent(contentId)}/images/${encodeURIComponent(assetId)}`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
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

export function listWorkflowRuns(signal?: AbortSignal): Promise<{ items: ApiWorkflowRun[] }> {
  return request("/api/automation/runs", { signal });
}

export function getTrends(signal?: AbortSignal, refresh = false): Promise<ApiTrendSnapshot> {
  return request(`/api/trends${refresh ? "?refresh=true" : ""}`, { signal });
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
