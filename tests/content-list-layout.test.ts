import assert from "node:assert/strict";
import test from "node:test";
import { ContentListLayouts, type ContentListLayout } from "../server/services/content-list-layout.js";
import type { ContentRecord } from "../server/domain/types.js";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import { PostgresAutomationRepository } from "../server/repositories/postgres.js";
import type { Pool } from "pg";
import { buildApp } from "../server/http/app.js";
import { testSystem } from "./helpers.js";

function content(id: string, day: number): ContentRecord {
  return { id, creationKey: id, title: `테스트 원고 ${id}`, topic: "보험", strategy: "trend", state: "drafting",
    createdAt: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`, updatedAt: "2026-10-20T00:00:00Z",
    createdBy: "carrot", assigneeId: "carrot", scheduledAt: null, publishedAt: null };
}
const records = [content("new", 20), content("old", 17), content("middle", 18)];
const summary = (items: Array<ContentRecord & { number: number }>) => items.map(item => [item.id, item.number]);

test("oldest is 1 at the bottom; refresh, editing and caller order cannot renumber", async () => {
  const repository = new InMemoryAutomationRepository();
  const service = new ContentListLayouts(repository);
  assert.deepEqual(summary(await service.arrange(records)), [["new", 3], ["middle", 2], ["old", 1]]);
  const revision = (await repository.getContentListLayout())!.revision;
  const updated = records.toReversed().map(item => ({ ...item, updatedAt: "2026-12-01", title: "수정한 제목" }));
  assert.deepEqual(summary(await new ContentListLayouts(repository).arrange(updated)), [["new", 3], ["middle", 2], ["old", 1]]);
  assert.equal((await repository.getContentListLayout())!.revision, revision, "ordinary reads never write");
});

test("deletion never reuses numbers; new arrivals go above custom order, restored IDs keep their number", async () => {
  const service = new ContentListLayouts(new InMemoryAutomationRepository());
  await service.arrange(records);
  const withoutNewest = records.filter(item => item.id !== "new");
  assert.deepEqual(summary(await service.arrange(withoutNewest)), [["middle", 2], ["old", 1]]);
  assert.deepEqual(summary(await service.arrange([...withoutNewest, content("next", 21)])), [["next", 4], ["middle", 2], ["old", 1]]);
  await service.arrange(records, { id: "middle", neighborId: "new", direction: "up" });
  assert.deepEqual(summary(await service.arrange([...records, content("last", 22)])), [["last", 5], ["middle", 2], ["new", 3], ["old", 1]]);
});

test("two clients moving the same neighbor do not swap back or lose saved order", async () => {
  const repository = new InMemoryAutomationRepository();
  const a = new ContentListLayouts(repository);
  const b = new ContentListLayouts(repository);
  await Promise.all([a.arrange(records), b.arrange(records)]);
  const move = { id: "old", neighborId: "middle", direction: "up" as const };
  const results = await Promise.allSettled([a.arrange(records, move), b.arrange(records, move)]);
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(results.filter(item => item.status === "rejected").length, 1);
  assert.deepEqual(summary(await b.arrange(records)), [["new", 3], ["old", 1], ["middle", 2]]);
  await assert.rejects(a.arrange(records, { id: "missing", neighborId: "new", direction: "up" }), { code: "CONTENT_NOT_FOUND" });
  await assert.rejects(a.arrange(records, { id: "new", neighborId: "middle", direction: "up" }), { code: "CONTENT_ORDER_CHANGED" });
});

test("API persists order independently of article dates, rejects stale moves and unauthorized callers", async t => {
  const system = testSystem();
  for (const item of records) await system.repository.createContent(item);
  const app = buildApp({ system });
  t.after(() => app.close());
  const initial = (await app.inject({ method: "GET", url: "/api/contents" })).json().items;
  assert.deepEqual(summary(initial), [["new", 3], ["middle", 2], ["old", 1]]);
  const payload = { neighborId: "new", direction: "up" };
  const forbidden = await app.inject({ method: "POST", url: "/api/contents/middle/move", payload,
    headers: { "x-user-roles": "reviewer" } });
  assert.equal(forbidden.statusCode, 403);
  const changed = await app.inject({ method: "POST", url: "/api/contents/middle/move", payload });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.deepEqual(summary(changed.json().items), [["middle", 2], ["new", 3], ["old", 1]]);
  assert.equal((await app.inject({ method: "POST", url: "/api/contents/middle/move", payload })).statusCode, 409);
  assert.deepEqual(await system.repository.getContent("middle"), records[2], "moving is not editing an article");
  assert.deepEqual(summary((await app.inject({ method: "GET", url: "/api/contents?refresh=true" })).json().items),
    [["middle", 2], ["new", 3], ["old", 1]]);
  await system.repository.deleteContentPermanently("new");
  await system.repository.createContent(content("next", 21));
  assert.deepEqual(summary((await app.inject({ method: "GET", url: "/api/contents" })).json().items),
    [["next", 4], ["middle", 2], ["old", 1]]);
});

test("Postgres layout reads and compare-and-swap writes are team scoped", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const state: ContentListLayout = { nextNumber: 1, entries: [], order: [] };
  const pool = { query: async (sql: string, values: unknown[]) => {
    calls.push({ sql, values });
    return { rows: [{ revision: 7, value: state }], rowCount: 1 };
  } } as unknown as Pool;
  const repository = new PostgresAutomationRepository("team-a", pool);
  assert.deepEqual(await repository.getContentListLayout(), { revision: 7, value: state });
  assert.equal(await repository.compareContentListLayout(0, state), true);
  assert.equal(await repository.compareContentListLayout(7, state), true);
  assert.match(calls[0]!.sql, /WHERE team_id=\$1/);
  assert.match(calls[1]!.sql, /ON CONFLICT DO NOTHING/);
  assert.match(calls[2]!.sql, /WHERE team_id=\$1 AND revision=\$2/);
  for (const call of calls) assert.equal(call.values[0], "team-a");
});
