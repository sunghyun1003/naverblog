import { bootstrapSystem } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { buildApp } from "./http/app.js";
import { GitHubAutomationService } from "./services/github-automation.js";
import { SessionAuthService } from "./services/session-auth.js";

const config = loadConfig();
const runtime = await bootstrapSystem(config);
const auth = new SessionAuthService({
  username: config.DASHBOARD_USERNAME,
  password: config.DASHBOARD_PASSWORD,
  sessionSecret: config.DASHBOARD_SESSION_SECRET ?? "development-only-carrot-session-secret",
  secureCookie: config.DASHBOARD_SECURE_COOKIE,
});
const githubAutomation = config.AUTOMATION_PROVIDER === "github"
  ? new GitHubAutomationService({
      owner: config.GITHUB_AUTOMATION_OWNER,
      repository: config.GITHUB_AUTOMATION_REPOSITORY,
      branch: config.GITHUB_AUTOMATION_BRANCH,
      token: config.GITHUB_AUTOMATION_TOKEN!,
    })
  : undefined;

const app = buildApp({
  system: runtime.system,
  webOrigin: config.WEB_ORIGIN,
  logger: true,
  databaseProvider: runtime.databaseProvider,
  auth,
  serveWeb: config.SERVE_WEB,
  ...(githubAutomation ? { githubAutomation } : {}),
});

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await app.close();
  await runtime.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(error);
  await shutdown();
  process.exitCode = 1;
}
