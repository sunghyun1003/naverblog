import { z } from "zod";

const optionalText = z.preprocess((value) => value === "" ? undefined : value, z.string().optional());
const booleanText = z.preprocess((value) => value === "true" || value === true, z.boolean());

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
  AUTOMATION_PROVIDER: z.enum(["mock", "github"]).default("mock"),
  DASHBOARD_USERNAME: z.string().min(1).default("carrot"),
  DASHBOARD_PASSWORD: z.string().min(1).default("carrot"),
  DASHBOARD_SESSION_SECRET: optionalText,
  DASHBOARD_SECURE_COOKIE: booleanText.default(false),
  GITHUB_AUTOMATION_OWNER: z.string().min(1).default("sunghyun1003"),
  GITHUB_AUTOMATION_REPOSITORY: z.string().min(1).default("naverblog-automation"),
  GITHUB_AUTOMATION_BRANCH: z.string().min(1).default("main"),
  GITHUB_AUTOMATION_TOKEN: optionalText,
  SERVE_WEB: booleanText.default(false),
}).superRefine((value, context) => {
  if (value.STORAGE_PROVIDER === "postgres") {
    if (!value.DATABASE_URL) {
      context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "PostgreSQL 사용 시 DATABASE_URL이 필요합니다." });
    }
    if (!value.DATABASE_TEAM_ID) {
      context.addIssue({ code: "custom", path: ["DATABASE_TEAM_ID"], message: "PostgreSQL 사용 시 DATABASE_TEAM_ID가 필요합니다." });
    }
  }
  if (value.AUTOMATION_PROVIDER === "github" && !value.GITHUB_AUTOMATION_TOKEN) {
    context.addIssue({ code: "custom", path: ["GITHUB_AUTOMATION_TOKEN"], message: "GitHub 자동화 연결 시 서버용 토큰이 필요합니다." });
  }
  if (value.NODE_ENV === "production" && (!value.DASHBOARD_SESSION_SECRET || value.DASHBOARD_SESSION_SECRET.length < 32)) {
    context.addIssue({ code: "custom", path: ["DASHBOARD_SESSION_SECRET"], message: "운영 세션 비밀값은 32자 이상이어야 합니다." });
  }
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({ ...environment, API_PORT: environment.API_PORT || environment.PORT });
}
