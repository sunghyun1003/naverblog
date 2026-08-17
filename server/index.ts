import { bootstrapSystem } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { buildApp } from "./http/app.js";

const config = loadConfig();
const runtime = await bootstrapSystem(config);

const app = buildApp({
  system: runtime.system,
  webOrigin: config.WEB_ORIGIN,
  logger: true,
  databaseProvider: runtime.databaseProvider,
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
