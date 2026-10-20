export type ContentStatus =
  | "drafting"
  | "ready"
  | "scheduled"
  | "published"
  | "deleted";

export interface ContentItem {
  id: string;
  number?: number;
  title: string;
  status: ContentStatus;
  assignee: string;
  initials: string;
  createdAt?: string;
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
