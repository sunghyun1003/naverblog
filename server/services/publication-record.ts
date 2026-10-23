import { z } from "zod";
import { DomainError } from "../domain/errors.js";
import { isNaverBlogUrl, type PublicationRecordDocument, type PublicationRecordInput } from "../../shared/publication-record.js";

export const publicationUrlSchema = z.string().trim().max(2048).refine(value => !value || isNaverBlogUrl(value), "네이버 블로그 게시 URL을 입력해주세요. (https://blog.naver.com/… 또는 https://m.blog.naver.com/…)");
export const publicationRecordInputSchema = z.object({ externalUrl: publicationUrlSchema, note: z.string().trim().max(2000) }).strict();
export const publicationRecordDocumentSchema = z.object({
  schemaVersion: z.literal(1), contentId: z.string(), revision: z.number().int().nonnegative(),
  externalUrl: publicationUrlSchema.nullable(),
  entries: z.array(z.object({ id: z.string().uuid(), externalUrl: publicationUrlSchema.nullable(), note: z.string().max(2000), recordedAt: z.iso.datetime(), recordedBy: z.string() })).max(100),
}).refine(value => value.revision === value.entries.length && (value.revision === 0 || value.externalUrl === value.entries.at(-1)?.externalUrl));
export interface PublicationRecordStore {
  getPublicationRecord(id: string): Promise<PublicationRecordDocument>;
  comparePublicationRecord(value: PublicationRecordDocument, expectedRevision: number): Promise<boolean>;
}
export const emptyPublicationRecord = (contentId: string): PublicationRecordDocument => ({ schemaVersion: 1, contentId, revision: 0, externalUrl: null, entries: [] });
export function publicationRecordView(record: PublicationRecordDocument, originalUrl: string | null): PublicationRecordDocument {
  return record.revision ? record : { ...record, externalUrl: originalUrl && isNaverBlogUrl(originalUrl) ? originalUrl : null };
}
const conflict = () => new DomainError("PUBLICATION_RECORD_CONFLICT", "다른 화면에서 발행 기록이 변경되었습니다. 기록 새로고침 후 다시 저장해주세요. 입력 내용은 유지됩니다.", 409);

export async function savePublicationRecord(store: PublicationRecordStore, contentId: string, entryId: string, expectedRevision: number,
  input: PublicationRecordInput, originalUrl: string | null, actor: string): Promise<PublicationRecordDocument> {
  const current = publicationRecordView(await store.getPublicationRecord(contentId), originalUrl);
  const externalUrl = input.externalUrl || null;
  const previous = current.entries.find(item => item.id === entryId);
  // A lost response may be retried with the same ID, but must never duplicate a note.
  if (previous) {
    if (previous.externalUrl === externalUrl && previous.note === input.note) return current;
    throw conflict();
  }
  if (current.revision !== expectedRevision) throw conflict();
  if (!input.note && externalUrl === current.externalUrl) return current;
  if (current.entries.length >= 100) throw new DomainError("PUBLICATION_RECORD_LIMIT", "발행 기록이 100개에 도달했습니다. 기존 기록은 보존됩니다.", 422);
  const next: PublicationRecordDocument = { ...current, revision: current.revision + 1, externalUrl,
    entries: [...current.entries, { id: entryId, externalUrl, note: input.note, recordedAt: new Date().toISOString(), recordedBy: actor }] };
  // URLs can also contain multibyte Korean text. Bound actual bytes, not just characters.
  if (Buffer.byteLength(`${JSON.stringify(next, null, 2)}\n`, "utf8") > 900_000) throw new DomainError("PUBLICATION_RECORD_LIMIT", "발행 기록의 저장 용량에 도달했습니다. 기존 기록은 보존됩니다.", 422);
  if (!await store.comparePublicationRecord(next, current.revision)) throw conflict();
  return next;
}

/** Local demo only. Production records live in the private repository. */
export class MemoryPublicationRecordStore implements PublicationRecordStore {
  private readonly records = new Map<string, PublicationRecordDocument>();
  async getPublicationRecord(id: string) { return structuredClone(this.records.get(id) ?? emptyPublicationRecord(id)); }
  async comparePublicationRecord(value: PublicationRecordDocument, revision: number) {
    if ((this.records.get(value.contentId)?.revision ?? 0) !== revision) return false;
    this.records.set(value.contentId, structuredClone(value));
    return true;
  }
}
