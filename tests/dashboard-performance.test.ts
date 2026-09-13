import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import { createAutomationSystem } from "../server/system.js";
import { buildApp } from "../server/http/app.js";
import { DashboardSync } from "../server/services/dashboard-sync.js";
import { draftToDetail } from "../server/services/github-content-mapper.js";
import type { AutomationDraftDetail, GitHubAutomationService } from "../server/services/github-automation.js";
import { PostgresAutomationRepository } from "../server/repositories/postgres.js";
import type { Pool } from "pg";

class SnapshotRepository extends InMemoryAutomationRepository {
  snapshots = new Map<string, { value: unknown; syncedAt: string }>();
  async getSnapshot<T>(key: string) { return this.snapshots.get(key) as { value: T; syncedAt: string } ?? null; }
  async saveSnapshot(key: string, value: unknown) { this.snapshots.set(key, { value: structuredClone(value), syncedAt: new Date().toISOString() }); }
}
function draft(): AutomationDraftDetail {
  const date = "2026-09-13T00:00:00Z";
  return { runId: "321", title: "보존된 원고 제목", topic: "보험", primaryKeyword: "보험", generatedAt: date,
    updatedAt: date, pipelineStatus: "FAILED", toneSkillApplied: true, toneVerdict: "PASS", reviewStatus: "pending",
    publicationStatus: "none", scheduledAt: null, publishedAt: null, articleMarkdown: "# 보존된 원고", copyPackage: "원고", sourcesMarkdown: "",
    article: { article: { title: "보존된 원고 제목" }, sources: [], factChecks: [] },
    state: { schemaVersion: 1, runId: "321", reviewStatus: "pending", publicationStatus: "none", checks: { sources: false, advertising: false },
      reason: null, approvedBy: null, rejectedBy: null, approvedAt: null, rejectedAt: null, scheduledAt: null, publishedAt: null,
      externalUrl: null, updatedAt: date, updatedBy: "system" },
  };
}

test("all persisted page reads return without contacting a blocked GitHub server", async () => {
  const repository = new SnapshotRepository();
  const detail = draftToDetail(draft());
  await repository.createContent(detail.content);
  for (const [key, value] of [["detail:321", detail], ["automation:runs", []], ["automation:history", []],
    ["automation:settings", { timezone: "Asia/Seoul" }], ["trends", { collectionDate: "2026-09-13", items: [] }]] as const) await repository.saveSnapshot(key, value);
  let calls = 0;
  const github = new Proxy({}, { get: () => () => { calls++; throw new Error("GitHub deliberately unavailable"); } }) as GitHubAutomationService;
  const app = buildApp({ system: createAutomationSystem({ repository }), databaseProvider: "postgres", githubAutomation: github });
  for (const url of ["/api/contents", "/api/contents/321", "/api/automation/history", "/api/automation/runs", "/api/automation/settings", "/api/trends"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200, url);
    assert.equal(response.headers["cache-control"], "private, no-store");
  }
  assert.equal(calls, 0);
  assert.equal((await app.inject({ method: "POST", url: "/api/internal/sync" })).statusCode, 401);
  await app.close();
});

test("sync updates a changed saved draft once, and keeps previous snapshots on failure", async () => {
  const repository = new SnapshotRepository();
  let version = "a", calls = 0, fail = false;
  const github = {
    draftRevisions: async () => ({ "321": version }),
    getDraft: async () => { calls++; if (fail) throw new Error("upstream failure"); return draft(); },
    listWorkflowRuns: async () => [], listAutomationHistory: async () => [], getAutomationSettings: async () => ({}), getTrends: async () => ({}),
  } as unknown as GitHubAutomationService;
  const sync = new DashboardSync(repository, github);
  assert.deepEqual(await sync.run(), { updated: 1, remaining: 0 });
  assert.deepEqual(await sync.run(), { updated: 0, remaining: 0 });
  assert.equal(calls, 1);
  const original = await repository.getSnapshot("detail:321");
  version = "b"; fail = true;
  await assert.rejects(sync.run());
  assert.deepEqual(await repository.getSnapshot("detail:321"), original);
  fail = false;
  assert.deepEqual(await sync.run(), { updated: 1, remaining: 0 });
});

test("metadata refreshes on each callback even when no draft changed", async () => {
  const repository = new SnapshotRepository();
  let collectionDate = "2026-09-12";
  const github = { draftRevisions: async () => ({}), listWorkflowRuns: async () => [], listAutomationHistory: async () => [],
    getAutomationSettings: async () => ({}), getTrends: async () => ({ collectionDate }),
  } as unknown as GitHubAutomationService;
  const sync = new DashboardSync(repository, github);
  await sync.run(); collectionDate = "2026-09-13"; await sync.run();
  assert.deepEqual((await repository.getSnapshot("trends"))?.value, { collectionDate });
});

test("50 content summaries use two user inserts and one bulk insert, with stale/delete guards", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = { query: async (sql: string, params: unknown[]) => { queries.push({ sql, params }); return { rows: [] }; } } as unknown as Pool;
  const repository = new PostgresAutomationRepository("test-team", pool);
  const content = draftToDetail(draft()).content;
  await repository.upsertContents(Array.from({ length: 50 }, (_, i) => ({ ...content, id: String(i), creationKey: `github-run:${i}` })));
  assert.equal(queries.length, 3);
  assert.match(queries[2]!.sql, /jsonb_to_recordset/);
  assert.match(queries[2]!.sql, /contents.updated_at <= EXCLUDED.updated_at/);
  assert.match(queries[2]!.sql, /NOT EXISTS.*dashboard_snapshots/s);
  assert.equal(JSON.parse(String(queries[2]!.params[0])).length, 50);
  await repository.saveSnapshot("detail:321", draftToDetail(draft()));
  assert.match(queries[3]!.sql, /dashboard_snapshots.value <> 'null'::jsonb/);
  assert.match(queries[3]!.sql, /timestamptz <=/);
});

test("verified sync callback is bounded and only rebuilds server-side source data", async () => {
  const repository = new SnapshotRepository();
  const github = {
    draftRevisions: async () => Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(321 + i), "revision"])),
    getDraft: async (id: string) => ({ ...draft(), runId: id }),
    listWorkflowRuns: async () => [], listAutomationHistory: async () => [], getAutomationSettings: async () => ({}), getTrends: async () => ({}),
  } as unknown as GitHubAutomationService;
  const app = buildApp({ system: createAutomationSystem({ repository }), databaseProvider: "postgres", githubAutomation: github,
    syncIdentity: { verifyAuthorization: async (header) => header === "Bearer test-verified-identity" } });
  const first = await app.inject({ method: "POST", url: "/api/internal/sync", headers: { authorization: "Bearer test-verified-identity" }, payload: { title: "must not be trusted" } });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), { updated: 5, remaining: 2 });
  assert.equal((await repository.listContents())[0]?.title, draft().title);
  const second = await app.inject({ method: "POST", url: "/api/internal/sync", headers: { authorization: "Bearer test-verified-identity" } });
  assert.deepEqual(second.json(), { updated: 2, remaining: 0 });
  await app.close();
});

test("a deleted snapshot returns 404 without resurrecting GitHub or relational data", async () => {
  const repository = new SnapshotRepository();
  await repository.createContent(draftToDetail(draft()).content);
  await repository.saveSnapshot("detail:321", null);
  let calls = 0;
  const github = { getDraft: async () => { calls++; return draft(); } } as unknown as GitHubAutomationService;
  const app = buildApp({ system: createAutomationSystem({ repository }), databaseProvider: "postgres", githubAutomation: github });
  assert.equal((await app.inject({ method: "GET", url: "/api/contents/321" })).statusCode, 404);
  assert.equal(calls, 0);
  await app.close();
});
