import type { ContentStatus } from "../types/content";

export const contentStatusLabel: Record<ContentStatus, string> = {
  drafting: "작성 중",
  ready: "완성",
  scheduled: "발행 예정",
  published: "발행 완료",
  deleted: "삭제됨",
};
