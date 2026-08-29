export type ContentStatus =
  | "planning"
  | "drafting"
  | "tone"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "deleted";

export interface ContentItem {
  id: string;
  title: string;
  status: ContentStatus;
  assignee: string;
  initials: string;
  updatedAt: string;
  publishAt: string | null;
}

export interface ActivityItem {
  id: string;
  title: string;
  message: string;
  time: string;
  tone: "brand" | "warning" | "info" | "neutral";
}
