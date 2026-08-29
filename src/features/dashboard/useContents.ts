import { useCallback, useEffect, useState } from "react";
import { createContent, deleteContents, generateContent, getCapabilities, listContents, runPipeline } from "../../api/client";
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
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [contentResponse, capabilityResponse] = await Promise.all([
      listContents(signal, true),
      getCapabilities(signal),
    ]);
    setContents(contentResponse.items.map(mapContent));
    setFreshness(contentResponse.freshness ?? null);
    setCapabilities(capabilityResponse);
    setConnectionStatus("connected");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setConnectionStatus("offline");
    });
    const interval = window.setInterval(() => {
      void refresh(controller.signal).catch(() => setConnectionStatus("offline"));
    }, 900_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [refresh, refreshVersion]);

  const createAndRun = async (title: string, strategy: "trend" | "original") => {
    setCreating(true);
    try {
      if (capabilities?.mode === "github-actions") {
        await generateContent(title, strategy);
      } else {
        const content = await createContent({ title, topic: title, strategy });
        await runPipeline(content.id);
        await refresh();
      }
      setConnectionStatus("connected");
    } finally {
      setCreating(false);
    }
  };

  const removeMany = async (ids: string[]) => {
    const idSet = new Set(ids);
    const previous = contents;
    // Remove from the visible list immediately. The physical GitHub/Neon
    // deletion continues in the background and is reconciled only on a
    // partial failure, so the user never waits for remote commits to render.
    setContents((current) => current.filter((content) => !idSet.has(content.id)));
    try {
      const result = await deleteContents(ids);
      if (result.failures.length) await refresh();
      return result;
    } catch (error) {
      setContents(previous);
      throw error;
    }
  };

  return {
    contents,
    connectionStatus,
    capabilities,
    freshness,
    creating,
    createAndRun,
    removeMany,
    reload: () => setRefreshVersion((current) => current + 1),
  };
}
