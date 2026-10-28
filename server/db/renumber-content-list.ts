import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import { securePostgresConnectionString } from "./connection.js";
import { planContentRenumbering, type ContentListLayout } from "../services/content-list-layout.js";

export async function renumberContentList(pool: Pool, teamId: string, expectedFingerprint = "") {
  if (!teamId || expectedFingerprint && !/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw new Error("Invalid maintenance parameters");
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    const saved = (await client.query<{ revision: number; value: ContentListLayout }>(
      `SELECT revision,value FROM content_list_layout WHERE team_id=$1${expectedFingerprint ? " FOR UPDATE" : ""}`, [teamId])).rows[0];
    if (!saved) throw new Error("번호표가 없습니다. 콘텐츠 목록을 먼저 새로고침해주세요.");
    const active = (await client.query<{ id: string; state: "drafting"; createdAt: string }>(
      `SELECT id,state,created_at::text AS "createdAt" FROM contents WHERE team_id=$1 AND state <> 'deleted'${expectedFingerprint ? " FOR SHARE" : ""}`, [teamId])).rows;
    const plan = planContentRenumbering(teamId, saved, active);
    if (expectedFingerprint && expectedFingerprint !== plan.fingerprint) throw new Error("목록이 미리보기 이후 변경되었습니다. 새 미리보기를 확인해주세요.");
    const changed = !isDeepStrictEqual(saved.value, plan.value);
    if (expectedFingerprint && changed) {
      const updated = await client.query(`UPDATE content_list_layout SET revision=revision+1,value=$3::jsonb
        WHERE team_id=$1 AND revision=$2`, [teamId, saved.revision, JSON.stringify(plan.value)]);
      if (updated.rowCount !== 1) throw new Error("번호표 충돌: 변경하지 않았습니다.");
      // Before/after registry is recoverable without storing or modifying bodies.
      await client.query(`INSERT INTO audit_logs(id,team_id,actor_id,action,detail)
        VALUES($1,$2,'github-actions','content_numbers_reset',$3::jsonb)`, [randomUUID(), teamId,
      JSON.stringify({ fingerprint: plan.fingerprint, previous: saved, next: { revision: saved.revision + 1, value: plan.value } })]);
      const verified = (await client.query<{ value: ContentListLayout }>(
        "SELECT value FROM content_list_layout WHERE team_id=$1", [teamId])).rows[0];
      if (!verified || !isDeepStrictEqual(verified.value, plan.value)) {
        throw new Error("저장 검증 실패: 변경을 취소합니다.");
      }
    }
    await client.query(expectedFingerprint ? "COMMIT" : "ROLLBACK");
    return { mode: expectedFingerprint ? "applied" : "preview", changed, revision: saved.revision + (expectedFingerprint && changed ? 1 : 0),
      count: active.length, nextNumber: plan.value.nextNumber, fingerprint: plan.fingerprint, changes: plan.changes };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: securePostgresConnectionString(connectionString), max: 1, connectionTimeoutMillis: 10_000 });
  try {
    console.log(JSON.stringify(await renumberContentList(pool, process.env.DATABASE_TEAM_ID || "carrot-company",
      process.env.RENUMBER_EXPECTED_FINGERPRINT || "")));
  } catch {
    // Do not put connection strings, hosts, SQL parameters or credentials in logs.
    console.error("번호 변경 실패. 데이터/권한 또는 미리보기 이후 변경 여부를 확인하세요. 전체 작업은 취소되었습니다.");
    process.exitCode = 1;
  } finally { await pool.end(); }
}
