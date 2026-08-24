import { useEffect, useState } from "react";
import { approveContent, getContentDetail, rejectContent } from "../../api/client";
import type { ApiContentDetail } from "../../api/types";

export function useContentDetail(contentId: string | undefined) {
  const [detail, setDetail] = useState<ApiContentDetail | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"loading" | "connected" | "offline">("loading");
  const [loadError, setLoadError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    if (!contentId) {
      setConnectionStatus("offline");
      setLoadError("원고 ID가 없습니다.");
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setConnectionStatus("loading");
    setLoadError("");
    getContentDetail(contentId, controller.signal)
      .then((response) => {
        setDetail(response);
        setConnectionStatus("connected");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetail(null);
        setConnectionStatus("offline");
        setLoadError(error instanceof Error ? error.message : "원고를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [contentId, requestVersion]);

  const approve = async (checks: { sources: boolean; advertising: boolean }) => {
    if (!contentId || connectionStatus !== "connected" || !detail) throw new Error("원고 연결을 확인한 뒤 다시 시도해주세요.");
    const content = await approveContent(contentId, checks);
    setDetail((current) => (current ? { ...current, content } : current));
    return content;
  };

  const reject = async (reason: string) => {
    if (!contentId || connectionStatus !== "connected" || !detail) throw new Error("원고 연결을 확인한 뒤 다시 시도해주세요.");
    const content = await rejectContent(contentId, reason);
    setDetail((current) => (current ? { ...current, content } : current));
    return content;
  };

  const reload = () => setRequestVersion((current) => current + 1);

  return { detail, connectionStatus, loadError, reload, approve, reject };
}
