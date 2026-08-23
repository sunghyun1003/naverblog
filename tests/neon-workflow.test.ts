import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Neon 마이그레이션과 Cloud Run 배포가 직렬화되고 접속 정보를 분리한다", async () => {
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
  assert.doesNotMatch(deployment, /dashboard-database-direct-url/);
});
