import { useEffect, useState } from "react";
import { createContent, getCapabilities, listContents, runPipeline } from "../../api/client";
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
    Promise.all([listContents(controller.signal), getCapabilities(controller.signal)])
      .then(([contentResponse, capabilityResponse]) => {
        setContents(contentResponse.items.map(mapContent));
        setCapabilities(capabilityResponse);
        setConnectionStatus("connected");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setConnectionStatus("offline");
      });
    return () => controller.abort();
  }, []);

  const createAndRun = async (title: string, strategy: "trend" | "original") => {
    setCreating(true);
    try {
      const created = await createContent({ title, topic: title, strategy });
      await runPipeline(created.id);
      const response = await listContents();
      setContents(response.items.map(mapContent));
      setConnectionStatus("connected");
      return created.id;
    } finally {
      setCreating(false);
    }
  };

  return { contents, setContents, connectionStatus, capabilities, creating, createAndRun };
}
