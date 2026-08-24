import { useEffect, useState } from "react";
import { createContent, generateContent, getCapabilities, listContents, runPipeline } from "../../api/client";
import { mapContent } from "../../api/mapping";
import type { ApiCapabilities, ApiFreshness } from "../../api/types";
import type { ContentItem } from "../../types/content";

type ConnectionStatus = "connecting" | "connected" | "offline";

export function useContents() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(null);
  const [freshness, setFreshness] = useState<ApiFreshness | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => Promise.all([listContents(controller.signal, true), getCapabilities(controller.signal)])
      .then(([contentResponse, capabilityResponse]) => {
        setContents(contentResponse.items.map(mapContent));
        setFreshness(contentResponse.freshness ?? null);
        setCapabilities(capabilityResponse);
        setConnectionStatus("connected");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setConnectionStatus("offline");
      });
    void refresh();
    // 최신 GitHub 원고 조회는 비용이 크므로 최초 진입과 15분 주기로만 실행한다.
    const interval = window.setInterval(() => void refresh(), 900_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, []);

  const createAndRun = async (title: string, strategy: "trend" | "original") => {
    setCreating(true);
    try {
      if (capabilities?.mode === "github-actions") {
        await generateContent(title, strategy);
      } else {
        const content = await createContent({ title, topic: title, strategy });
        await runPipeline(content.id);
        const refreshed = await listContents();
        setContents(refreshed.items.map(mapContent));
      }
      setConnectionStatus("connected");
    } finally {
      setCreating(false);
    }
  };

  return { contents, connectionStatus, capabilities, freshness, creating, createAndRun };
}
