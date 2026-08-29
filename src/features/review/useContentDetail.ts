import { useCallback, useEffect, useState } from "react";
import { approveContent, deleteContent, editContent, getContentDetail, rejectContent } from "../../api/client";
import type { ApiContentDetail } from "../../api/types";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";

export function useContentDetail(contentId: string | undefined) {
  const cachedDetail = contentId ? readRuntimeCache<ApiContentDetail>(`content:${contentId}`) : null;
  const [detail, setDetail] = useState<ApiContentDetail | null>(cachedDetail);
  const [connectionStatus, setConnectionStatus] = useState<"loading" | "connected" | "offline">(cachedDetail ? "connected" : "loading");
  const [loadError, setLoadError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const refresh = useCallback(async (force = true) => {
    if (!contentId) throw new Error("Content ID is missing.");
    const response = await getContentDetail(contentId, undefined, force);
    setDetail(response);
    writeRuntimeCache(`content:${contentId}`, response);
    setConnectionStatus("connected");
    setLoadError("");
    return response;
  }, [contentId]);

  useEffect(() => {
    if (!contentId) {
      setConnectionStatus("offline");
      setLoadError("원고 ID가 없습니다.");
      return;
    }
    const controller = new AbortController();
    const cached = readRuntimeCache<ApiContentDetail>(`content:${contentId}`);
    if (cached) setDetail(cached);
    setConnectionStatus(cached ? "connected" : "loading");
    setLoadError("");
    getContentDetail(contentId, controller.signal, false)
      .then((response) => {
        setDetail(response);
        writeRuntimeCache(`content:${contentId}`, response);
        setConnectionStatus("connected");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!readRuntimeCache<ApiContentDetail>(`content:${contentId}`)) setDetail(null);
        setConnectionStatus("offline");
        setLoadError(error instanceof Error ? error.message : "원고를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [contentId, requestVersion]);

  const approve = async (checks: { sources: boolean; advertising: boolean }) => {
    if (!contentId || connectionStatus !== "connected" || !detail) throw new Error("원고 연결을 확인한 뒤 다시 시도해주세요.");
    const content = await approveContent(contentId, checks);
    setDetail((current) => {
      if (!current) return current;
      const next = { ...current, content };
      writeRuntimeCache(`content:${contentId}`, next);
      return next;
    });
    return content;
  };

  const reject = async (reason: string) => {
    if (!contentId || connectionStatus !== "connected" || !detail) throw new Error("원고 연결을 확인한 뒤 다시 시도해주세요.");
    const content = await rejectContent(contentId, reason);
    setDetail((current) => {
      if (!current) return current;
      const next = { ...current, content };
      writeRuntimeCache(`content:${contentId}`, next);
      return next;
    });
    return content;
  };

  const edit = async (input: { title: string; body: string; reason?: string | null }) => {
    if (!contentId || connectionStatus !== "connected" || !detail) throw new Error("원고 연결을 확인한 뒤 다시 시도해주세요.");
    const content = await editContent(contentId, input);
    setDetail((current) => {
      if (!current) return current;
      const next = { ...current, content };
      writeRuntimeCache(`content:${contentId}`, next);
      return next;
    });
    return content;
  };

  const remove = async () => {
    if (!contentId || connectionStatus !== "connected" || !detail) throw new Error("원고 연결을 확인한 뒤 다시 시도해주세요.");
    const content = await deleteContent(contentId);
    setDetail((current) => {
      if (!current) return current;
      const next = { ...current, content };
      writeRuntimeCache(`content:${contentId}`, next);
      return next;
    });
    return content;
  };

  const reload = () => setRequestVersion((current) => current + 1);

  return { detail, connectionStatus, loadError, reload, refresh, approve, reject, edit, remove };
}
