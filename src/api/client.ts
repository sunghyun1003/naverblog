import type { ApiCapabilities, ApiContent, ApiContentDetail, ApiJob } from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const localActorHeaders = {
  "X-User-Id": "local-admin",
  "X-User-Roles": "admin",
};

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
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...localActorHeaders, ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(payload?.error?.message ?? "API 요청에 실패했습니다.", response.status, payload?.error?.code ?? "UNKNOWN");
  }
  return response.json() as Promise<T>;
}

export function listContents(signal?: AbortSignal): Promise<{ items: ApiContent[] }> {
  return request("/api/contents", { signal });
}

export function getCapabilities(signal?: AbortSignal): Promise<ApiCapabilities> {
  return request("/api/system/capabilities", { signal });
}

export function getContentDetail(contentId: string, signal?: AbortSignal): Promise<ApiContentDetail> {
  return request(`/api/contents/${encodeURIComponent(contentId)}`, { signal });
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

export function approveContent(contentId: string): Promise<ApiContent> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ checks: { sources: true, advertising: true } }),
  });
}

export function rejectContent(contentId: string, reason: string): Promise<ApiContent> {
  return request(`/api/contents/${encodeURIComponent(contentId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
