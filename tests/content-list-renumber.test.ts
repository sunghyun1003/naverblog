import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { planContentRenumbering, ContentListLayouts } from "../server/services/content-list-layout.js";
import { renumberContentList } from "../server/db/renumber-content-list.js";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import type { ContentRecord } from "../server/domain/types.js";

const content = (id: string, day: number): ContentRecord => ({ id, creationKey: id, title: id, topic: "보험", strategy: "trend",
  state: "drafting", createdAt: `2026-10-${day}T00:00:00Z`, updatedAt: "2026-10-28T00:00:00Z",
  createdBy: "carrot", assigneeId: "carrot", scheduledAt: null, publishedAt: null });
const saved = { revision: 7, value: { nextNumber: 13, entries: [{ id: "deleted", number: 1 }, { id: "a", number: 8 }, { id: "b", number: 12 }], order: ["a", "deleted", "b"] } };
const active = [content("b", 21), content("a", 20)];

test("explicit reset starts at the bottom, excludes deleted records and retains custom display order", async () => {
  const before = structuredClone({ saved, active });
  const plan = planContentRenumbering("carrot-company", saved, [...active, { ...content("deleted", 19), state: "deleted" }]);
  assert.deepEqual(plan.value, { nextNumber: 3, entries: [{ id: "b", number: 1 }, { id: "a", number: 2 }], order: ["a", "b"] });
  assert.deepEqual({ saved, active }, before);
  const repository = new InMemoryAutomationRepository();
  await repository.compareContentListLayout(0, plan.value);
  const service = new ContentListLayouts(repository);
  assert.deepEqual((await service.arrange([...active, content("new", 28)])).map(item => [item.id, item.number]), [["new", 3], ["a", 2], ["b", 1]]);
  assert.deepEqual((await service.arrange([active[0]!, content("new", 28)])).map(item => [item.id, item.number]), [["new", 3], ["b", 1]], "later deletions do not renumber again");
});

test("fingerprint protects team, revision, deletions, new arrivals and rearrangements", () => {
  const plan = planContentRenumbering("team-a", saved, active);
  assert.equal(planContentRenumbering("team-a", saved, active.toReversed()).fingerprint, plan.fingerprint);
  for (const [team, layout, records] of [
    ["team-b", saved, active], ["team-a", { ...saved, revision: 8 }, active],
    ["team-a", saved, active.slice(0, 1)], ["team-a", saved, [...active, content("new", 28)]],
    ["team-a", { ...saved, value: { ...saved.value, order: saved.value.order.toReversed() } }, active],
  ] as const) assert.notEqual(planContentRenumbering(team, layout, [...records]).fingerprint, plan.fingerprint);
  assert.deepEqual(planContentRenumbering("team-a", saved, []).value, { nextNumber: 1, entries: [], order: [] });
});

function database(options: { auditFailure?: boolean; corruptReadback?: boolean } = {}) {
  let value = structuredClone(saved.value);
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const pool = { connect: async () => ({ release() {}, query: async (sql: string, values: unknown[] = []) => {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT revision")) return { rows: [{ ...saved, value }] };
    if (sql.startsWith("SELECT id,state")) return { rows: active };
    if (sql.startsWith("UPDATE content_list_layout")) { value = JSON.parse(values[2] as string); return { rowCount: 1 }; }
    if (sql.startsWith("INSERT INTO audit_logs") && options.auditFailure) throw new Error("Audit failed");
    if (sql.startsWith("SELECT value")) return { rows: [{ value: options.corruptReadback ? saved.value : value }] };
    return { rows: [], rowCount: 1 };
  } }) } as unknown as Pool;
  return { pool, calls };
}

test("preview is read-only; exact fingerprint updates one team and backs up the original numbering", async () => {
  const preview = database();
  const plan = await renumberContentList(preview.pool, "carrot-company");
  assert.equal(plan.mode, "preview");
  assert.ok(!preview.calls.some(call => /^(UPDATE|INSERT|DELETE)/.test(call.sql)));
  assert.equal(preview.calls.at(-1)!.sql, "ROLLBACK");
  const apply = database();
  const result = await renumberContentList(apply.pool, "carrot-company", plan.fingerprint);
  assert.equal(result.mode, "applied");
  assert.equal(result.count, 2);
  assert.equal(result.nextNumber, 3);
  assert.equal(result.revision, 8);
  const writes = apply.calls.filter(call => /^(UPDATE|INSERT|DELETE)/.test(call.sql));
  assert.equal(writes.length, 2);
  assert.match(writes[0]!.sql, /WHERE team_id=\$1 AND revision=\$2/);
  assert.deepEqual(writes[0]!.values.slice(0, 2), ["carrot-company", 7]);
  const backup = JSON.parse(writes[1]!.values[2] as string);
  assert.deepEqual(backup.previous, saved);
  assert.equal(backup.next.value.nextNumber, 3);
  assert.equal(apply.calls.at(-1)!.sql, "COMMIT");
});

test("stale preview, audit failure and incorrect saved numbers roll back without touching bodies", async () => {
  const fingerprint = planContentRenumbering("carrot-company", saved, active).fingerprint;
  for (const [options, expected] of [[{}, "a".repeat(64)], [{ auditFailure: true }, fingerprint], [{ corruptReadback: true }, fingerprint]] as const) {
    const db = database(options);
    await assert.rejects(renumberContentList(db.pool, "carrot-company", expected));
    assert.equal(db.calls.at(-1)!.sql, "ROLLBACK");
    assert.ok(!db.calls.some(call => /^(UPDATE|DELETE FROM) (contents|content_versions|dashboard_snapshots)\b/.test(call.sql)));
  }
});
