import type { AppConfig } from "./config.js";
import { PostgresAutomationRepository } from "./repositories/postgres.js";
import { seedDemoData } from "./seed.js";
import { createAutomationSystem, type AutomationSystem } from "./system.js";

export interface RuntimeSystem {
  system: AutomationSystem;
  databaseProvider: "memory" | "postgres";
  close(): Promise<void>;
}

export async function bootstrapSystem(config: AppConfig): Promise<RuntimeSystem> {
  if (config.STORAGE_PROVIDER === "postgres") {
    const repository = PostgresAutomationRepository.create({
      connectionString: config.DATABASE_URL!,
      teamId: config.DATABASE_TEAM_ID!,
      maxConnections: config.DATABASE_POOL_MAX,
    });
    try {
      await repository.pool.query("SELECT 1");
      const team = await repository.pool.query("SELECT 1 FROM teams WHERE id=$1", [config.DATABASE_TEAM_ID]);
      if (!team.rowCount) throw new Error(`운영 팀을 찾을 수 없습니다: ${config.DATABASE_TEAM_ID}. 먼저 데이터베이스 마이그레이션을 실행하세요.`);
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
