import { z } from "zod";

const optionalText = z.preprocess((value) => value === "" ? undefined : value, z.string().optional());

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  WEB_ORIGIN: z.string().default("http://127.0.0.1:5173"),
  STORAGE_PROVIDER: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: optionalText,
  DATABASE_TEAM_ID: optionalText,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
}).superRefine((value, context) => {
  if (value.STORAGE_PROVIDER !== "postgres") return;
  if (!value.DATABASE_URL) {
    context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "PostgreSQL 사용 시 DATABASE_URL이 필요합니다." });
  }
  if (!value.DATABASE_TEAM_ID) {
    context.addIssue({ code: "custom", path: ["DATABASE_TEAM_ID"], message: "PostgreSQL 사용 시 DATABASE_TEAM_ID가 필요합니다." });
  }
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(environment);
}
