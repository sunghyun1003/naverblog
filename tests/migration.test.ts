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
});
