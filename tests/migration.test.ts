import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("초기 마이그레이션에 운영 핵심 테이블과 중복 방지 제약이 포함된다", async () => {
  const sql = await readFile(new URL("../server/db/migrations/001_initial.sql", import.meta.url), "utf8");
  const requiredTables = [
    "teams", "users", "roles", "user_roles", "contents", "trend_signals", "sources", "claims",
    "content_versions", "automation_jobs", "automation_job_steps", "qa_results", "approvals",
    "publications", "audit_logs", "content_metrics",
  ];
  for (const table of requiredTables) assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`));
  assert.match(sql, /UNIQUE \(team_id, creation_key\)/);
  assert.match(sql, /idempotency_key text NOT NULL UNIQUE/);
  assert.match(sql, /one_open_publication_per_content/);
  assert.match(sql, /'carrot-company', '블로그 운영센터'/);
  assert.match(sql, /'github-actions'.*'GitHub Actions'/);
  assert.doesNotMatch(sql, /\bid uuid\b/);
});

test("편집 품질 결과를 저장할 수 있도록 품질 분류 제약을 확장한다", async () => {
  const sql = await readFile(new URL("../server/db/migrations/002_editorial_quality.sql", import.meta.url), "utf8");
  assert.match(sql, /DROP CONSTRAINT IF EXISTS qa_results_category_check/);
  assert.match(sql, /'editorial'/);
});

test("DB 검증은 편집 품질 스키마와 적용 기록을 확인한다", async () => {
  const source = await readFile(new URL("../server/db/verify.ts", import.meta.url), "utf8");
  assert.match(source, /qa_results_category_check/);
  assert.match(source, /002_editorial_quality\.sql/);
  assert.match(source, /qualityCategories/);
});
