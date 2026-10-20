import { useCallback, useEffect, useRef, useState } from "react";
import { cachedContents, createContent, deleteContents, generateContent, getCapabilities, listContents, moveContent, runPipeline } from "../../api/client";
import { mapContent } from "../../api/mapping";
import type { ApiCapabilities, ApiFreshness } from "../../api/types";
import type { ContentItem } from "../../types/content";
import { readRuntimeCache, writeRuntimeCache } from "../../api/runtimeCache";

type ConnectionStatus = "connecting" | "connected" | "offline";

export function useContents() {
  const cachedValue = readRuntimeCache<{ contents: ContentItem[]; capabilities: ApiCapabilities | null; freshness: ApiFreshness | null }>("contents");
  const shared = cachedContents();
  const cached = shared ? { contents: shared.items.map(mapContent), freshness: shared.freshness ?? null, capabilities: cachedValue?.capabilities ?? null } : cachedValue;
  const [contents, setContents] = useState<ContentItem[]>(cached?.contents ?? []);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(cached ? "connected" : "connecting");
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(cached?.capabilities ?? null);
  const [freshness, setFreshness] = useState<ApiFreshness | null>(cached?.freshness ?? null);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);
  const readRevision = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal, force = false) => {
    if (movingRef.current) return;
    const revision = ++readRevision.current;
    const current = () => !signal?.aborted && revision === readRevision.current;
    setRefreshing(true);
    try {
      // The content list is the primary surface. A transient capabilities
      // failure must not hide an otherwise healthy list or lock the page into
      // an offline state; reconcile each response independently.
      const results = await Promise.allSettled([
        listContents(signal, force).then((value) => {
          if (current()) { setContents(value.items.map(mapContent)); setFreshness(value.freshness ?? null); setConnectionStatus("connected"); }
          return value;
        }),
        getCapabilities(signal).then((value) => { if (current()) setCapabilities(value); return value; }),
      ]);
      if (!current()) return;

      const [contentResult, capabilityResult] = results;
      if (contentResult.status === "fulfilled") {
        const nextContents = contentResult.value.items.map(mapContent);
        const nextFreshness = contentResult.value.freshness ?? null;
        setContents(nextContents);
        setFreshness(nextFreshness);
        const cachedState = readRuntimeCache<{ capabilities: ApiCapabilities | null }>("contents");
        const nextCapabilities = capabilityResult.status === "fulfilled" ? capabilityResult.value : cachedState?.capabilities ?? null;
        if (capabilityResult.status === "fulfilled") setCapabilities(capabilityResult.value);
        writeRuntimeCache("contents", { contents: nextContents, capabilities: nextCapabilities, freshness: nextFreshness });
        setConnectionStatus("connected");
      } else if (capabilityResult.status === "fulfilled") {
        setCapabilities(capabilityResult.value);
        setConnectionStatus("offline");
      } else {
        throw contentResult.reason;
      }
    } finally {
      if (current()) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Render cached/mirrored data immediately, then reconcile GitHub in the
    // background. `refresh` never hides the current list, so this can safely
    // use the fast mirror path on route entry. A forced GitHub reconciliation
    // is reserved for the explicit refresh button and the periodic poll; doing
    // it on every tab visit made the dashboard wait on GitHub unnecessarily.
    void refresh(controller.signal, false).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setConnectionStatus("offline");
    });
    const interval = window.setInterval(() => {
      if (!document.hidden) void refresh(controller.signal, false).catch(() => setConnectionStatus("offline"));
    }, 30_000);
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

  const move = async (id: string, neighborId: string, direction: "up" | "down") => {
    if (movingRef.current) return;
    movingRef.current = true;
    readRevision.current++;
    setMoving(true);
    setRefreshing(false);
    try {
      const result = await moveContent(id, neighborId, direction);
      const nextContents = result.items.map(mapContent);
      setContents(nextContents);
      setFreshness(result.freshness ?? null);
      writeRuntimeCache("contents", { contents: nextContents, capabilities, freshness: result.freshness ?? null });
    } catch (error) {
      movingRef.current = false;
      // Resolve a concurrent move, deletion, or uncertain network response
      // from the mirror; do not force a slow GitHub synchronization.
      await refresh().catch(() => undefined);
      throw error;
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  };

  return {
    contents,
    connectionStatus,
    capabilities,
    freshness,
    creating,
    refreshing,
    moving,
    move,
    createAndRun,
    removeMany,
    refreshNow: () => refresh(undefined, true),
  };
}
