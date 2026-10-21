export const feedbackScopes = {
  all: "모든 보종 공통", auto: "자동차보험", driver: "운전자보험", travel: "여행자보험",
  cancer: "암보험", indemnity: "실손보험", health: "건강보험", property: "화재·재산보험",
  golf: "골프·홀인원보험", life: "생명·종신보험", general: "일반 보험 정보",
} as const;
export type FeedbackScope = keyof typeof feedbackScopes;
export interface ComplianceFeedbackInput {
  excerpt: string;
  guidance: string;
  replacement: string;
  scope: FeedbackScope;
  kind: "wording" | "avoid";
  active: boolean;
}
export interface ComplianceFeedback extends ComplianceFeedbackInput {
  id: string;
  contentTitle: string;
  contentVersion: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}
export interface ComplianceFeedbackDocument {
  schemaVersion: 1;
  contentId: string;
  revision: number;
  items: ComplianceFeedback[];
}
export function suggestFeedbackScope(topic: string): FeedbackScope {
  const text = topic.replace(/\s/g, "");
  const patterns: Array<[FeedbackScope, RegExp]> = [["driver", /운전자보험/], ["auto", /자동차|원데이|주행거리/],
    ["travel", /여행/], ["cancer", /암보험/], ["indemnity", /실손|실비/], ["property", /화재|주택|누수/],
    ["golf", /골프|홀인원/], ["health", /건강보험/], ["life", /생명|종신/]];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? "general";
}
