import { DomainError } from "./errors.js";
import type { ContentState } from "./types.js";

const allowedTransitions: Record<ContentState, readonly ContentState[]> = {
  idea: ["researching"],
  researching: ["brief_ready", "idea"],
  brief_ready: ["drafting", "researching"],
  drafting: ["review_ready", "brief_ready"],
  review_ready: ["approved", "drafting", "scheduled"],
  approved: ["scheduled", "review_ready"],
  scheduled: ["published", "approved"],
  published: ["measured"],
  measured: [],
  deleted: [],
};

export function canTransition(from: ContentState, to: ContentState): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: ContentState, to: ContentState): void {
  if (!canTransition(from, to)) {
    throw new DomainError(
      "INVALID_CONTENT_TRANSITION",
      `콘텐츠 상태를 ${from}에서 ${to}(으)로 변경할 수 없습니다.`,
      409,
      { from, to },
    );
  }
}

export function listAllowedTransitions(state: ContentState): readonly ContentState[] {
  return allowedTransitions[state];
}
