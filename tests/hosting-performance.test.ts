import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Firebase serves built assets directly and reserves authenticated APIs for Cloud Run", () => {
  const config = JSON.parse(readFileSync("firebase.json", "utf8"));
  const hosting = config.hosting;
  assert.equal(hosting.public, "dist");
  assert.equal(hosting.rewrites.find((rule: { source: string }) => rule.source === "/api/**").run.serviceId, "naverblog-dashboard");
  assert.equal(hosting.rewrites.at(-1).destination, "/index.html");
  assert.match(JSON.stringify(hosting.headers), /immutable/);
  assert.match(JSON.stringify(hosting.headers), /no-cache/);
  assert.equal(hosting.headers[0].source, "**");
  assert.equal(hosting.headers[0].headers[0].value, "no-cache"); // SPA entry routes must revalidate too.
  assert.equal(hosting.headers.find((rule: { source: string }) => rule.source === "/api/**").headers[0].value, "private,no-store");
  const workflow = readFileSync(".github/workflows/cloud-run.yml", "utf8");
  assert.match(workflow, /firebase-tools@15 deploy --only hosting:dashboard/);
  assert.match(workflow, /--min-instances 0/); // No paid always-on instance introduced.
});
