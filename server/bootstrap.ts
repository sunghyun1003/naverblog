import type { AppConfig } from "./config.js";
import { PostgresAutomationRepository } from "./repositories/postgres.js";
import { seedDemoData } from "./seed.js";
import { createAutomationSystem, type AutomationSystem } from "./system.js";

export interface RuntimeSystem {
  system: AutomationSystem;
  databaseProvider: "memory" | "postgres";
  close(): Promise<void>;
}

// Neon free-tier computes suspend or archive when idle, and the first
// connection after that can exceed the pool's 5s connect timeout. Cloud Run
// scales to zero, so every cold start may hit a sleeping database. Retry the
// readiness ping well inside Cloud Run's 240s startup window instead of
// exiting on the first timeout (incident 2026-11-18).
export async function waitForDatabase(
  ping: () => Promise<unknown>,
  options: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void>; log?: (message: string) => void } = {},
): Promise<void> {
  const attempts = options.attempts ?? 8;
  const delayMs = options.delayMs ?? 5_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const log = options.log ?? ((message: string) => console.warn(message));
  for (let attempt = 1; ; attempt += 1) {
    try {
      await ping();
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      log(`Database not ready (attempt ${attempt}/${attempts}): ${error instanceof Error ? error.message : String(error)}`);
      await sleep(delayMs);
    }
  }
}

export async function bootstrapSystem(config: AppConfig): Promise<RuntimeSystem> {
  if (config.STORAGE_PROVIDER === "postgres") {
    const repository = PostgresAutomationRepository.create({
      connectionString: config.DATABASE_URL!,
      teamId: config.DATABASE_TEAM_ID!,
      maxConnections: config.DATABASE_POOL_MAX,
    });
    try {
      await waitForDatabase(() => repository.pool.query("SELECT 1"));
      // Fail during deployment readiness, not on a user's first list request.
      await repository.pool.query("SELECT team_id,revision,value FROM content_list_layout LIMIT 0");
      const [team, editorialMigration, nativeKoreanMigration, deletedStateMigration, qualityConstraint, contentStateConstraint] = await Promise.all([
        repository.pool.query("SELECT 1 FROM teams WHERE id=$1", [config.DATABASE_TEAM_ID]),
        repository.pool.query(
          "SELECT 1 FROM schema_migrations WHERE filename='002_editorial_quality.sql'",
        ),
        repository.pool.query(
          "SELECT 1 FROM schema_migrations WHERE filename='003_native_korean_quality.sql'",
        ),
        repository.pool.query(
          "SELECT 1 FROM schema_migrations WHERE filename='004_deleted_content_state.sql'",
        ),
        repository.pool.query<{ definition: string }>(
          `SELECT pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
           WHERE conname='qa_results_category_check'`,
        ),
        repository.pool.query<{ definition: string }>(
          `SELECT pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
           WHERE conname='contents_state_check'`,
        ),
      ]);
      if (!team.rowCount) throw new Error(`운영 팀을 찾을 수 없습니다: ${config.DATABASE_TEAM_ID}. 먼저 데이터베이스 마이그레이션을 실행하세요.`);
      if (!editorialMigration.rowCount || !nativeKoreanMigration.rowCount || !deletedStateMigration.rowCount
        || !qualityConstraint.rows[0]?.definition.includes("native_korean")
        || !contentStateConstraint.rows[0]?.definition.includes("deleted")) {
        throw new Error("운영 DB에 최신 품질·삭제 상태 스키마가 적용되지 않았습니다. 먼저 DB 마이그레이션을 실행하세요.");
      }
      return {
        system: createAutomationSystem({ repository }),
        databaseProvider: "postgres",
        close: () => repository.close(),
      };
    } catch (error) {
      await repository.close();
      throw error;
    }
  }

  const system = createAutomationSystem();
  await seedDemoData(system);
  return { system, databaseProvider: "memory", close: async () => undefined };
}
