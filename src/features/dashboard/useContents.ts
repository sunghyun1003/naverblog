import { useCallback, useEffect, useState } from "react";
import { createContent, deleteContents, generateContent, getCapabilities, listContents, runPipeline } from "../../api/client";
import { mapContent } from "../../api/mapping";
import type { ApiCapabilities, ApiFreshness } from "../../api/types";
import type { ContentItem } from "../../types/content";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";

type ConnectionStatus = "connecting" | "connected" | "offline";

export function useContents() {
  const cachedValue = readRuntimeCache<{ contents: ContentItem[]; capabilities: ApiCapabilities | null; freshness: ApiFreshness | null }>("contents");
  const cached = cachedValue && cachedValue.freshness?.stale !== true ? cachedValue : null;
  const [contents, setContents] = useState<ContentItem[]>(cached?.contents ?? []);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(cached ? "connected" : "connecting");
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(cached?.capabilities ?? null);
  const [freshness, setFreshness] = useState<ApiFreshness | null>(cached?.freshness ?? null);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal, force = false) => {
    setRefreshing(true);
    try {
      const [contentResponse, capabilityResponse] = await Promise.all([
        listContents(signal, force),
        getCapabilities(signal),
      ]);
      const nextContents = contentResponse.items.map(mapContent);
      const nextFreshness = contentResponse.freshness ?? null;
      setContents(nextContents);
      setFreshness(nextFreshness);
      setCapabilities(capabilityResponse);
      writeRuntimeCache("contents", { contents: nextContents, capabilities: capabilityResponse, freshness: nextFreshness });
      setConnectionStatus("connected");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Render cached/mirrored data immediately, then reconcile GitHub in the
    // background. `refresh` never hides the current list, so this can safely
    // use the fast mirror path on route entry. A forced GitHub reconciliation
    // is reserved for the explicit refresh button and the periodic poll; doing
    // it on every tab visit made the dashboard wait on GitHub unnecessarily.
    void refresh(controller.signal, !cached).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setConnectionStatus("offline");
    });
    const interval = window.setInterval(() => {
      void refresh(controller.signal, true).catch(() => setConnectionStatus("offline"));
    }, 900_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [refresh]);

  const createAndRun = async (title: string, strategy: "trend" | "original") => {
    setCreating(true);
    try {
      if (capabilities?.mode === "github-actions") {
        await generateContent(title, strategy);
      } else {
        const content = await createContent({ title, topic: title, strategy });
        await runPipeline(content.id);
        await refresh(undefined, true);
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
    const nextContents = contents.filter((content) => !idSet.has(content.id));
    setContents(nextContents);
    const cachedState = readRuntimeCache<{ capabilities: ApiCapabilities | null; freshness: ApiFreshness | null }>("contents");
    writeRuntimeCache("contents", { contents: nextContents, capabilities: cachedState?.capabilities ?? capabilities, freshness: cachedState?.freshness ?? freshness });
    try {
      const result = await deleteContents(ids);
      if (result.failures.length) await refresh(undefined, true);
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
    refreshing,
    createAndRun,
    removeMany,
    refreshNow: () => refresh(undefined, true),
  };
}
