import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Neon 마이그레이션과 Cloud Run 배포가 직렬화되고 배포 전에 DB를 검증한다", async () => {
  const [migration, deployment] = await Promise.all([
    readFile(new URL("../.github/workflows/migrate-neon.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/cloud-run.yml", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /name: migrate-neon-database/);
  assert.match(migration, /group: dashboard-production/);
  assert.match(migration, /dashboard-database-direct-url/);
  assert.doesNotMatch(migration, /latest --secret=dashboard-database-url/);
  assert.doesNotMatch(migration, /gcloud secrets describe/);

  assert.match(deployment, /group: dashboard-production/);
  assert.match(deployment, /STORAGE_PROVIDER=postgres/);
  assert.match(deployment, /DATABASE_TEAM_ID=carrot-company/);
  assert.match(deployment, /DATABASE_URL=dashboard-database-url:latest/);
  assert.match(deployment, /dashboard-database-direct-url/);
  assert.doesNotMatch(deployment, /latest --secret=dashboard-database-url/);
  assert.match(deployment, /DIRECT_DATABASE_URL/);
  const migrationIndex = deployment.indexOf("npm run db:migrate");
  const verificationIndex = deployment.indexOf("npm run db:verify");
  const deploymentIndex = deployment.indexOf("gcloud run deploy");
  assert.ok(migrationIndex > 0);
  assert.ok(verificationIndex > migrationIndex);
  assert.ok(deploymentIndex > verificationIndex);
});
