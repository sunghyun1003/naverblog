import type { ApiContent, ApiContentState } from "./types";
import type { ContentItem, ContentStatus } from "../types/content";

const statusMap: Record<ApiContentState, ContentStatus> = {
  idea: "planning",
  researching: "planning",
  brief_ready: "planning",
  drafting: "drafting",
  review_ready: "review",
  approved: "approved",
  scheduled: "scheduled",
  published: "published",
  measured: "published",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
}

export function mapContent(content: ApiContent): ContentItem {
  return {
    id: content.id,
    title: content.title,
    status: statusMap[content.state],
    assignee: content.assigneeId === "demo-editor" ? "김서연" : "나",
    initials: content.assigneeId === "demo-editor" ? "김" : "나",
    updatedAt: formatDate(content.updatedAt) ?? "방금",
    publishAt: formatDate(content.scheduledAt),
  };
}
