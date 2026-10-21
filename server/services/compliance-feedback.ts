import { z } from "zod";
import { DomainError } from "../domain/errors.js";
import type { ComplianceFeedbackDocument, ComplianceFeedbackInput } from "../../shared/compliance-feedback.js";

export const feedbackInputSchema = z.object({
  excerpt: z.string().trim().min(1).max(500),
  guidance: z.string().trim().min(3).max(1000),
  replacement: z.string().trim().max(500),
  scope: z.enum(["all", "auto", "driver", "travel", "cancer", "indemnity", "health", "property", "golf", "life", "general"]),
  kind: z.enum(["wording", "avoid"]),
  active: z.boolean(),
}).strict();
export const feedbackDocumentSchema = z.object({
  schemaVersion: z.literal(1), contentId: z.string(), revision: z.number().int().nonnegative(),
  items: z.array(feedbackInputSchema.extend({ id: z.string(), contentTitle: z.string(), contentVersion: z.number().int().positive(),
    createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), updatedBy: z.string() })).max(100),
});
export interface ComplianceFeedbackStore {
  getComplianceFeedback(contentId: string): Promise<ComplianceFeedbackDocument>;
  compareComplianceFeedback(value: ComplianceFeedbackDocument, expectedRevision: number): Promise<boolean>;
}
export const emptyFeedback = (contentId: string): ComplianceFeedbackDocument => ({ schemaVersion: 1, contentId, revision: 0, items: [] });
export const feedbackConflict = () => new DomainError("FEEDBACK_CONFLICT", "다른 곳에서 피드백이 변경되었습니다. 목록을 새로고침한 뒤 다시 저장해주세요. 입력 내용은 유지됩니다.", 409);

export async function saveComplianceFeedback(store: ComplianceFeedbackStore, contentId: string, id: string,
  expectedRevision: number, input: ComplianceFeedbackInput, source: { title: string; version: number }, actor: string) {
  const current = await store.getComplianceFeedback(contentId);
  const previous = current.items.find(item => item.id === id);
  // Retrying an uncertain save with the same ID must not create a second rule.
  if (previous && Object.keys(input).every(key => previous[key as keyof ComplianceFeedbackInput] === input[key as keyof ComplianceFeedbackInput])) return current;
  if (current.revision !== expectedRevision) throw feedbackConflict();
  if (!previous && current.items.length >= 100) throw new DomainError("FEEDBACK_LIMIT", "이 원고의 피드백이 100개입니다. 기존 항목을 수정해주세요.", 422);
  const now = new Date().toISOString();
  const item = { ...input, id, contentTitle: previous?.contentTitle ?? source.title, contentVersion: previous?.contentVersion ?? source.version,
    createdAt: previous?.createdAt ?? now, updatedAt: now, updatedBy: actor };
  const next: ComplianceFeedbackDocument = { ...current, revision: current.revision + 1,
    items: previous ? current.items.map(value => value.id === id ? item : value) : [...current.items, item] };
  if (!await store.compareComplianceFeedback(next, current.revision)) throw feedbackConflict();
  return next;
}

/** Development mock only. Production uses the private automation repository,
 * so a successful save is immediately available to the next workflow checkout. */
export class MemoryComplianceFeedbackStore implements ComplianceFeedbackStore {
  private readonly documents = new Map<string, ComplianceFeedbackDocument>();
  async getComplianceFeedback(id: string) { return structuredClone(this.documents.get(id) ?? emptyFeedback(id)); }
  async compareComplianceFeedback(value: ComplianceFeedbackDocument, revision: number) {
    if ((this.documents.get(value.contentId)?.revision ?? 0) !== revision) return false;
    this.documents.set(value.contentId, structuredClone(value));
    return true;
  }
}
