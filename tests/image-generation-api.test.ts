import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../server/http/app.js";
import type { AutomationDraftDetail, GitHubAutomationService } from "../server/services/github-automation.js";
import { SessionAuthService } from "../server/services/session-auth.js";

test("image generation can be requested before editorial approval", async (context) => {
  const draft = {
    reviewStatus: "pending",
    state: { deletedAt: null, rewriteStatus: null },
  } as unknown as AutomationDraftDetail;
  const dispatches: Array<{ workflow: string; inputs: Record<string, string> }> = [];
  let updatedState = { ...draft.state };
  const githubAutomation = {
    getDraft: async () => draft,
    updateState: async (_runId: string, changes: Record<string, unknown>) => {
      updatedState = { ...updatedState, ...changes };
      return updatedState;
    },
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
  assert.equal(updatedState.imageGenerationStatus, "queued");
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

test("local copy validation returns an empty signed asset list instead of blocking text copy", async (context) => {
  const app = buildApp({ databaseProvider: "memory" });
  context.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/contents/local-draft/copy-assets" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json<{ items: unknown[] }>().items, []);
});

test("복사용 이미지는 로그인 없이도 짧게 유효한 서명 주소로 제공한다", async (context) => {
  const imageBytes = Buffer.from("signed-image");
  const githubAutomation = {
    getDraft: async () => ({ imageManifest: {
      status: "ready",
      technicalQualityPassed: true,
      visualQualityPassed: true,
      assets: [{ id: "hero", path: "hero.jpg" }],
    } }),
    getDraftImage: async () => ({ body: imageBytes, contentType: "image/jpeg", etag: "etag-1" }),
  } as unknown as GitHubAutomationService;
  const auth = new SessionAuthService({ username: "carrot", password: "carrot", sessionSecret: "copy-test-session-secret", secureCookie: false });
  const app = buildApp({ githubAutomation, auth, databaseProvider: "memory" });
  context.after(() => app.close());
  const session = auth.login("carrot", "carrot", "test")!;
  const assets = await app.inject({ method: "GET", url: "/api/contents/123/copy-assets", headers: { cookie: auth.sessionCookie(session), host: "dashboard.example" } });
  assert.equal(assets.statusCode, 200);
  const url = new URL(assets.json<{ items: Array<{ url: string }> }>().items[0]!.url);
  const image = await app.inject({ method: "GET", url: `${url.pathname}${url.search}` });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["cache-control"], "public, max-age=900");
  assert.deepEqual(image.rawPayload, imageBytes);
});
