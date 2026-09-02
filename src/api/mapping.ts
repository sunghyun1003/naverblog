import type { ApiContent, ApiContentState } from "./types";
import type { ContentItem, ContentStatus } from "../types/content";

const statusMap: Record<ApiContentState, ContentStatus> = {
  idea: "drafting",
  researching: "drafting",
  brief_ready: "drafting",
  drafting: "drafting",
  review_ready: "ready",
  approved: "ready",
  scheduled: "scheduled",
  published: "published",
  measured: "published",
  deleted: "deleted",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(date);
}

export function mapContent(content: ApiContent): ContentItem {
  return {
    id: content.id,
    title: content.title,
    status: statusMap[content.state],
    assignee: content.assigneeId ?? "carrot",
    initials: (content.assigneeId ?? "carrot").slice(0, 1).toUpperCase(),
    updatedAt: formatDate(content.updatedAt) ?? "방금",
    publishAt: formatDate(content.scheduledAt),
  };
}
