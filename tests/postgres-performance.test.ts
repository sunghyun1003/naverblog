import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresAutomationRepository } from "../server/repositories/postgres.js";

test("트렌드 여러 건을 PostgreSQL 한 번의 쿼리로 저장한다", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  const repository = new PostgresAutomationRepository("carrot-company", pool);
  const collectedAt = "2026-08-24T00:00:00.000Z";

  await repository.saveTrendSignals([
    { id: "trend-1", sourceType: "naver_blog", title: "첫 번째", url: "https://example.test/1", publishedAt: collectedAt, engagementScore: 90, relevanceScore: 90, trustScore: 40, topicKey: "보험", collectedAt },
    { id: "trend-2", sourceType: "naver_blog", title: "두 번째", url: "https://example.test/2", publishedAt: collectedAt, engagementScore: 70, relevanceScore: 70, trustScore: 40, topicKey: "실손보험", collectedAt },
  ]);

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /jsonb_to_recordset/);
  assert.equal(JSON.parse(String(calls[0]!.values[0])).length, 2);
});

test("트렌드 목록은 가장 최근 수집 시각의 배치만 조회한다", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  const repository = new PostgresAutomationRepository("carrot-company", pool);

  await repository.listTrendSignals();

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /collected_at=\(SELECT MAX\(collected_at\)/);
  assert.deepEqual(calls[0]!.values, ["carrot-company"]);
});

test("품질 검사 메시지는 PostgreSQL jsonb 값으로 직렬화한다", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  const repository = new PostgresAutomationRepository("carrot-company", pool);

  await repository.saveQualityResults("content-1", [{
    id: "quality-1",
    contentId: "content-1",
    versionId: "version-1",
    category: "facts",
    status: "warning",
    score: 80,
    messages: ["사실 확인이 필요합니다."],
    checkedAt: "2026-08-24T00:00:00.000Z",
  }]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.values[6], '["사실 확인이 필요합니다."]');
});
