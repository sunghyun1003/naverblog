import { useEffect, useState } from "react";
import { approveContent, getContentDetail, rejectContent } from "../../api/client";
import type { ApiContentDetail } from "../../api/types";

export function useContentDetail(contentId: string | undefined) {
  const [detail, setDetail] = useState<ApiContentDetail | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"loading" | "connected" | "offline">("loading");

  useEffect(() => {
    if (!contentId) return;
    const controller = new AbortController();
    getContentDetail(contentId, controller.signal)
      .then((response) => {
        setDetail(response);
        setConnectionStatus("connected");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setConnectionStatus("offline");
      });
    return () => controller.abort();
  }, [contentId]);

  const approve = async () => {
    if (!contentId) return null;
    const content = await approveContent(contentId);
    setDetail((current) => (current ? { ...current, content } : current));
    return content;
  };

  const reject = async (reason: string) => {
    if (!contentId) return null;
    const content = await rejectContent(contentId, reason);
    setDetail((current) => (current ? { ...current, content } : current));
    return content;
  };

  return { detail, connectionStatus, approve, reject };
}
