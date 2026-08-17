import type { ActivityItem, ContentItem, ContentStatus } from "../types/content";

export const contentStatusLabel: Record<ContentStatus, string> = {
  planning: "기획",
  drafting: "작성 중",
  tone: "말투 보정",
  review: "검토 필요",
  approved: "승인 완료",
  scheduled: "예약",
  published: "발행 완료",
};

export const initialContents: ContentItem[] = [
  {
    id: "silson-generations",
    title: "실손보험 세대별 차이, 무엇이 달라졌을까?",
    status: "review",
    assignee: "김서연",
    initials: "김",
    updatedAt: "10분 전",
    publishAt: null,
  },
  {
    id: "car-renewal-checklist",
    title: "자동차보험 갱신 전 확인할 5가지",
    status: "tone",
    assignee: "이민준",
    initials: "이",
    updatedAt: "25분 전",
    publishAt: "8월 19일",
  },
  {
    id: "claim-documents",
    title: "보험금 청구 시 놓치기 쉬운 서류",
    status: "scheduled",
    assignee: "박하늘",
    initials: "박",
    updatedAt: "1시간 전",
    publishAt: "8월 18일",
  },
  {
    id: "dental-waiting-period",
    title: "치아보험 가입 전 확인할 면책기간",
    status: "planning",
    assignee: "최유진",
    initials: "최",
    updatedAt: "2시간 전",
    publishAt: null,
  },
  {
    id: "annuity-basics",
    title: "연금보험과 연금저축, 이름은 비슷하지만 달라요",
    status: "drafting",
    assignee: "김서연",
    initials: "김",
    updatedAt: "어제",
    publishAt: null,
  },
  {
    id: "travel-insurance",
    title: "여행자보험에서 자주 놓치는 휴대품 보장",
    status: "published",
    assignee: "이민준",
    initials: "이",
    updatedAt: "8월 15일",
    publishAt: "8월 15일",
  },
];

export const recentActivities: ActivityItem[] = [
  {
    id: "activity-1",
    title: "실손보험 세대별 차이",
    message: "상태가 ‘검토 필요’로 변경됨",
    time: "10분 전",
    tone: "brand",
  },
  {
    id: "activity-2",
    title: "자동차보험 갱신 전 확인할 5가지",
    message: "말투 보정 완료",
    time: "25분 전",
    tone: "warning",
  },
  {
    id: "activity-3",
    title: "보험금 청구 시 놓치기 쉬운 서류",
    message: "8월 18일 발행 예약",
    time: "1시간 전",
    tone: "info",
  },
];
