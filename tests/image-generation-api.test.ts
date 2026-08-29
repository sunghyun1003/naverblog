import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../server/http/app.js";
import type { AutomationDraftDetail, GitHubAutomationService } from "../server/services/github-automation.js";

test("image generation can be requested before editorial approval", async (context) => {
  const draft = {
    reviewStatus: "pending",
    state: { deletedAt: null, rewriteStatus: null },
  } as unknown as AutomationDraftDetail;
  const dispatches: Array<{ workflow: string; inputs: Record<string, string> }> = [];
  const githubAutomation = {
    getDraft: async () => draft,
    dispatch: async (workflow: string, inputs: Record<string, string>) => {
      dispatches.push({ workflow, inputs });
    },
  } as unknown as GitHubAutomationService;
  const app = buildApp({ githubAutomation, databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/contents/910/images/generate",
    payload: { assetId: "visual-02", feedback: "Show all four coverage roles in one natural scene." },
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(dispatches, [{
    workflow: "images",
    inputs: {
      run_id: "910",
      force: "true",
      asset_id: "visual-02",
      feedback: "Show all four coverage roles in one natural scene.",
    },
  }]);
});
