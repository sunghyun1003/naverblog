// User-selected destination. These are public blog/category identifiers, not credentials.
export const DEFAULT_NAVER_BLOG_ID = "hanwhains_carrot";
export const DEFAULT_NAVER_CATEGORY = { id: "63", name: "자동차보험" } as const;
export interface NaverCategory { id: string; name: string }
