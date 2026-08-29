import { Pool } from "pg";
import { securePostgresConnectionString } from "./connection.js";

const connectionString = process.env.DATABASE_URL;
const teamId = process.env.DATABASE_TEAM_ID ?? "carrot-company";
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다.");

const pool = new Pool({ connectionString: securePostgresConnectionString(connectionString), max: 1, connectionTimeoutMillis: 10_000 });

try {
  const requiredTables = ["teams", "users", "contents", "content_versions", "automation_jobs", "audit_logs"];
  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const found = new Set(tables.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !found.has(table));
  if (missing.length) throw new Error(`필수 테이블이 없습니다: ${missing.join(", ")}`);

  const team = await pool.query<{ name: string }>("SELECT name FROM teams WHERE id=$1", [teamId]);
  if (!team.rowCount) throw new Error(`운영 팀이 없습니다: ${teamId}`);

  const users = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE team_id=$1 AND id = ANY($2::text[]) ORDER BY id",
    [teamId, ["carrot", "github-actions", "system"]],
  );
  if (users.rowCount !== 3) throw new Error("초기 운영 사용자가 모두 생성되지 않았습니다.");

  const qualityConstraint = await pool.query<{ definition: string }>(
    `SELECT pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conname='qa_results_category_check'`,
  );
  const qualityConstraintDefinition = qualityConstraint.rows[0]?.definition ?? "";
  if (!qualityConstraintDefinition.includes("editorial") || !qualityConstraintDefinition.includes("native_korean")) {
    throw new Error("편집 품질·한국어 자연스러움 분류 마이그레이션이 적용되지 않았습니다.");
  }

  const migrations = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename",
  );
  if (!migrations.rows.some((row) => row.filename === "002_editorial_quality.sql")
    || !migrations.rows.some((row) => row.filename === "003_native_korean_quality.sql")) {
    throw new Error("편집 품질·한국어 자연스러움 마이그레이션 적용 기록이 없습니다.");
  }

  const counts = await pool.query<{
    contents: string;
    content_versions: string;
    trend_signals: string;
    automation_jobs: string;
    audit_logs: string;
  }>(
    `SELECT
       (SELECT count(*) FROM contents WHERE team_id=$1)::text AS contents,
       (SELECT count(*) FROM content_versions v JOIN contents c ON c.id=v.content_id WHERE c.team_id=$1)::text AS content_versions,
       (SELECT count(*) FROM trend_signals WHERE team_id=$1)::text AS trend_signals,
       (SELECT count(*) FROM automation_jobs j JOIN contents c ON c.id=j.content_id WHERE c.team_id=$1)::text AS automation_jobs,
       (SELECT count(*) FROM audit_logs WHERE team_id=$1)::text AS audit_logs`,
    [teamId],
  );
  const stored = counts.rows[0]!;

  process.stdout.write(JSON.stringify({
    status: "ok",
    provider: "postgres",
    teamId,
    teamName: team.rows[0]!.name,
    tables: requiredTables.length,
    migrations: migrations.rows.map((row) => row.filename),
    qualityCategories: ["facts", "seo", "geo", "tone", "native_korean", "advertising", "editorial"],
    users: users.rows.map((row) => row.id),
    stored: {
      contents: Number(stored.contents),
      contentVersions: Number(stored.content_versions),
      trendSignals: Number(stored.trend_signals),
      automationJobs: Number(stored.automation_jobs),
      auditLogs: Number(stored.audit_logs),
    },
  }));
} finally {
  await pool.end();
}
