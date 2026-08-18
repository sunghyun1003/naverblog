import { useEffect, useState } from "react";
import { createContent, generateContent, getCapabilities, listContents, runPipeline } from "../../api/client";
import { mapContent } from "../../api/mapping";
import type { ApiCapabilities } from "../../api/types";
import { initialContents } from "../../data/content";
import type { ContentItem } from "../../types/content";

type ConnectionStatus = "connecting" | "connected" | "offline";

export function useContents() {
  const [contents, setContents] = useState<ContentItem[]>(initialContents);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => Promise.all([listContents(controller.signal), getCapabilities(controller.signal)])
      .then(([contentResponse, capabilityResponse]) => {
        setContents(contentResponse.items.map(mapContent));
        setCapabilities(capabilityResponse);
        setConnectionStatus("connected");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setConnectionStatus("offline");
      });
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
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

  return { contents, setContents, connectionStatus, capabilities, creating, createAndRun };
}
