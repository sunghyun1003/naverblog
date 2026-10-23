export interface PublicationRecordEntry {
  id: string;
  externalUrl: string | null;
  note: string;
  recordedAt: string;
  recordedBy: string;
}

/** Operator notes about the live post, not revisions of the source manuscript. */
export interface PublicationRecordDocument {
  schemaVersion: 1;
  contentId: string;
  revision: number;
  externalUrl: string | null;
  entries: PublicationRecordEntry[];
}

export interface PublicationRecordInput { externalUrl: string; note: string }

export function isNaverBlogUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["blog.naver.com", "m.blog.naver.com"].includes(url.hostname)
      && !url.username && !url.password && !url.port && url.pathname !== "/";
  } catch { return false; }
}
