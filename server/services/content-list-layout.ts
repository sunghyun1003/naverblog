import { DomainError } from "../domain/errors.js";
import { createHash } from "node:crypto";
import type { ContentRecord } from "../domain/types.js";

export interface ContentListLayout {
  nextNumber: number;
  entries: Array<{ id: string; number: number }>;
  order: string[];
}

export interface ContentListLayoutStore {
  getContentListLayout(): Promise<{ revision: number; value: ContentListLayout } | null>;
  compareContentListLayout(revision: number, value: ContentListLayout): Promise<boolean>;
}

export interface ContentMove {
  id: string;
  neighborId: string;
  direction: "up" | "down";
}

/** Explicit maintenance only. Ordinary reads/deletions must never call this. */
export function planContentRenumbering(teamId: string, saved: { revision: number; value: ContentListLayout },
  contents: Array<Pick<ContentRecord, "id" | "state" | "createdAt">>) {
  const active = contents.filter(item => item.state !== "deleted");
  const ids = new Set(active.map(item => item.id));
  const previous = saved.value;
  if (ids.size !== active.length || new Set(previous.order).size !== previous.order.length
    || new Set(previous.entries.map(item => item.id)).size !== previous.entries.length) {
    throw new Error("번호표에 중복 ID가 있어 초기화를 중단합니다.");
  }
  // Match arrange(): new arrivals above the existing custom order. Never sort
  // existing rows by title/updatedAt or undo a user's up/down rearrangement.
  const missing = active.filter(item => !previous.order.includes(item.id)).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id, "en", { numeric: true }));
  const order = [...missing.map(item => item.id).reverse(), ...previous.order.filter(id => ids.has(id))];
  const entries = order.toReversed().map((id, index) => ({ id, number: index + 1 }));
  const value: ContentListLayout = { nextNumber: entries.length + 1, entries, order };
  const fingerprint = createHash("sha256").update(JSON.stringify({ teamId, saved, order })).digest("hex");
  const oldNumbers = new Map(previous.entries.map(entry => [entry.id, entry.number]));
  return { fingerprint, value, changes: entries.map(entry => ({ ...entry, previousNumber: oldNumbers.get(entry.id) ?? null })) };
}

/** Numbers are a permanent registry; display order is an independent preference.
 * Keep deleted IDs in the registry so neither deletion nor a later sync reuses
 * their numbers. Only currently active contents are rendered or moved.
 */
export class ContentListLayouts {
  constructor(private readonly store: ContentListLayoutStore) {}

  async arrange(contents: ContentRecord[], move?: ContentMove): Promise<Array<ContentRecord & { number: number }>> {
    const active = contents.filter(item => item.state !== "deleted");
    for (let attempt = 0; attempt < 5; attempt++) {
      const saved = await this.store.getContentListLayout();
      const layout: ContentListLayout = structuredClone(saved?.value ?? { nextNumber: 1, entries: [], order: [] });
      const numbers = new Map(layout.entries.map(entry => [entry.id, entry.number]));
      const added = active.filter(item => !numbers.has(item.id)).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id, "en", { numeric: true }));
      for (const item of added) {
        const number = layout.nextNumber++;
        layout.entries.push({ id: item.id, number });
        numbers.set(item.id, number);
        layout.order.unshift(item.id);
      }
      const byId = new Map(active.map(item => [item.id, item]));
      const visibleOrder = layout.order.filter(id => byId.has(id));
      if (move) {
        const index = visibleOrder.indexOf(move.id);
        if (index === -1 || !byId.has(move.neighborId)) {
          throw new DomainError("CONTENT_NOT_FOUND", "이동할 원고가 삭제되었거나 목록에 없습니다. 새로고침해주세요.", 404);
        }
        if (visibleOrder[index + (move.direction === "up" ? -1 : 1)] !== move.neighborId) {
          throw new DomainError("CONTENT_ORDER_CHANGED", "목록 순서가 변경되었습니다. 최신 목록에서 다시 이동해주세요.", 409);
        }
        const from = layout.order.indexOf(move.id);
        const to = layout.order.indexOf(move.neighborId);
        [layout.order[from], layout.order[to]] = [layout.order[to]!, layout.order[from]!];
      }
      if ((added.length || move) && !await this.store.compareContentListLayout(saved?.revision ?? 0, layout)) continue;
      return layout.order.flatMap(id => {
        const content = byId.get(id);
        return content ? [{ ...content, number: numbers.get(id)! }] : [];
      });
    }
    throw new DomainError("CONTENT_ORDER_BUSY", "다른 순서 변경이 처리 중입니다. 잠시 후 다시 시도해주세요.", 409);
  }
}
