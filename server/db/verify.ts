import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
const teamId = process.env.DATABASE_TEAM_ID ?? "carrot-company";
if (!connectionString) throw new Error("DATABASE_URL이 필요합니다.");

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });

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

  process.stdout.write(JSON.stringify({
    status: "ok",
    provider: "postgres",
    teamId,
    teamName: team.rows[0]!.name,
    tables: requiredTables.length,
    users: users.rows.map((row) => row.id),
  }));
} finally {
  await pool.end();
}
