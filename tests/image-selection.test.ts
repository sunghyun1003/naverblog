import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { GitHubAutomationService, type AutomationDraftDetail, type DashboardDraftState, type GeneratedImageManifest } from "../server/services/github-automation.js";
import { appliedImageIds, imageManifestKey, imageUsageMetadata } from "../server/services/image-usage.js";
import { draftToDetail } from "../server/services/github-content-mapper.js";
import { markdownBlocks, renderableImages } from "../src/features/review/imageUsage.js";
import { buildApp } from "../server/http/app.js";
import { SessionAuthService } from "../server/services/session-auth.js";

const now = "2026-09-14T01:00:00.000Z";
const ids = ["hero", "visual-01", "visual-02"];
test("Windows 줄바꿈에서도 본문 구역과 이미지 삽입 위치를 분리한다", () => {
  assert.deepEqual(markdownBlocks("# 제목\r\n\r\n본문\r\n\r\n## 구역\r\n\r\n내용"), markdownBlocks("# 제목\n\n본문\n\n## 구역\n\n내용"));
});
function fixture() {
  const bytes = Buffer.from("saved-test-image");
  const manifest: GeneratedImageManifest = {
    schemaVersion: 1, runId: "123", generatedAt: now, sourceRevision: 1, styleProfileId: "default",
    status: "failed", technicalQualityPassed: true, visualQualityPassed: false, humanReviewRequired: false,
    visualQuality: { overallPassed: false, summary: "본문 1 반복 구도", assets: ids.map(id => ({ id, passed: id !== "visual-01",
      scores: { realism: 5, composition: 5, relevance: 4, artifactControl: 5, novelty: id === "visual-01" ? 2 : 5 },
      defects: id === "visual-01" ? ["반복 구도"] : [], recommendation: "구도 변경" })) },
    checks: [], assets: ids.map((id, index) => ({ id, role: index === 0 ? "hero" : "inline", kind: "ai_generated", path: `${id}.jpg`,
      width: 1376, height: 768, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
      afterSection: index, purpose: "concept", altText: id })),
  };
  let state: DashboardDraftState = { schemaVersion: 1, runId: "123", reviewStatus: "approved", publicationStatus: "none", checks: { sources: true, advertising: true },
    reason: null, approvedAt: now, rejectedAt: null, scheduledAt: null, publishedAt: null, externalUrl: null,
    revision: 1, rewriteStatus: "completed", imageGenerationStatus: "failed", updatedAt: now, updatedBy: "test", textQualityPassed: true };
  const base = "output/drafts/2026-09-14/run-123";
  const files: Record<string, unknown> = {
    [`${base}/status.json`]: { status: "TONE_REVIEW_COMPLETE", toneSkillApplied: true, toneVerdict: "PASS", generatedAt: now, revision: 1, imageGenerationStatus: "failed" },
    [`${base}/article.json`]: { planning: { topic: "보험" }, article: { title: "보험 비교 기준", sections: [] }, factChecks: [], sources: [] },
    [`${base}/article.md`]: "# 보험 비교 기준\n\n저장된 원고입니다.",
    [`${base}/images/manifest.json`]: manifest,
  };
  const service = new GitHubAutomationService({ owner: "test", repository: "test", branch: "main", token: "test" }, (async (input, init) => {
    const url = decodeURIComponent(String(input));
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.includes("/git/trees/")) return json({ truncated: false, tree: Object.keys(files).map(path => ({ path, type: "blob" })) });
    const path = url.split("/contents/")[1]?.split("?")[0];
    if (!path) return json({}, 404);
    if (init?.method === "PUT") {
      state = JSON.parse(Buffer.from(JSON.parse(String(init.body)).content, "base64").toString("utf8"));
      return json({});
    }
    const value = path.includes("dashboard/decisions/") ? state : files[path];
    if (path.endsWith(".jpg")) return json({ content: bytes.toString("base64"), encoding: "base64", sha: "image" });
    if (value === undefined) return json({}, 404);
    return json({ content: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64"), encoding: "base64", sha: "state" });
  }) as typeof fetch);
  const input = (assetIds = ["hero", "visual-02"]) => ({ manifestKey: imageManifestKey(manifest), revision: 1, expectedUpdatedAt: state.updatedAt, assetIds, acknowledgedRejectedIds: [] as string[] });
  return { service, manifest, input, bytes, state: () => state };
}

test("실패 패키지 미리보기는 검수 원본이나 일반 이미지 권한을 변경하지 않는다", async () => {
  const { service, manifest } = fixture();
  await service.getDraftImage("123", "hero", { allowFailed: true });
  assert.equal(manifest.status, "failed");
  await assert.rejects(service.getDraftImage("123", "hero"), /본문에 적용/);
  assert.deepEqual(await service.getDraftImageAssetIds("123"), []);
});

test("통과한 두 장만 적용하고 본문·복사·목록 완료 상태가 일치하며 AI 검수는 보존한다", async () => {
  const { service, input } = fixture();
  const saved = await service.selectDraftImages("123", input(), "carrot");
  assert.deepEqual(await service.getDraftImageAssetIds("123"), ["hero", "visual-02"]);
  await assert.rejects(service.getDraftImage("123", "visual-01"));
  const detail = draftToDetail(saved);
  assert.equal(detail.content.state, "approved");
  const manifest = detail.versions.at(-1)!.metadata.imagePackage as GeneratedImageManifest;
  assert.equal(manifest.status, "failed");
  assert.equal(manifest.visualQualityPassed, false);
  assert.deepEqual(renderableImages(manifest)?.assets?.map(asset => asset.id), ["hero", "visual-02"]);
  assert.equal((await service.listDrafts())[0]?.selectedImageCount, 2);
  assert.equal((await service.getDraft("123")).selectedImageCount, 2);
});

test("반려 이미지에는 명시적 확인이 필요하고 적용 취소도 저장된다", async () => {
  const { service, input, state } = fixture();
  await assert.rejects(service.selectDraftImages("123", input(["visual-01"]), "carrot"), /반려 이유/);
  await service.selectDraftImages("123", { ...input(ids), acknowledgedRejectedIds: ["visual-01"] }, "carrot");
  assert.deepEqual(state().imageSelection?.acknowledgedRejectedIds, ["visual-01"]);
  assert.equal((await service.getDraftImageAssetIds("123")).length, 3);
  await service.selectDraftImages("123", input([]), "carrot");
  assert.deepEqual(await service.getDraftImageAssetIds("123"), []);
});

test("변경된 원고·파일·검수 결과와 오래된 화면에서는 선택을 거부한다", async () => {
  const { service, manifest, input } = fixture();
  await assert.rejects(service.selectDraftImages("123", { ...input(), revision: 2 }, "carrot"), /변경/);
  await assert.rejects(service.selectDraftImages("123", { ...input(), expectedUpdatedAt: "old" }, "carrot"), /변경/);
  await assert.rejects(service.selectDraftImages("123", { ...input(), manifestKey: "old" }, "carrot"), /변경/);
  manifest.assets[0]!.sha256 = "bad-hash";
  await assert.rejects(service.selectDraftImages("123", input(), "carrot"), /파일이 검사 결과와/);
  manifest.technicalQualityPassed = false;
  await assert.rejects(service.selectDraftImages("123", input(), "carrot"), /파일 검사를/);
});

test("재생성·재작성 후 예전 반려 이미지 선택이 새 이미지로 넘어가지 않는다", async () => {
  const { service, manifest, input, state } = fixture();
  await service.selectDraftImages("123", { ...input(ids), acknowledgedRejectedIds: ["visual-01"] }, "carrot");
  assert.deepEqual(appliedImageIds(manifest, state().imageSelection, 2), []);
  manifest.generatedAt = "2026-09-15T01:00:00.000Z";
  assert.deepEqual(appliedImageIds(manifest, state().imageSelection, 1), []);
  assert.equal(imageUsageMetadata(manifest, state().imageSelection, 1).selection, null);
});

test("이미지 적용은 원고 검수를 우회하지 않고 모두 제외하면 완료로 표시하지 않는다", async () => {
  const { service, manifest, input, state } = fixture();
  state().textQualityPassed = false;
  const textFailed = await service.selectDraftImages("123", input(), "carrot");
  assert.equal(draftToDetail(textFailed).content.state, "drafting");
  state().textQualityPassed = true;
  manifest.status = "ready"; manifest.visualQualityPassed = true;
  const noImages = await service.selectDraftImages("123", input([]), "carrot");
  noImages.pipelineStatus = "CONTENT_READY"; noImages.imageGenerationStatus = "ready";
  assert.equal(draftToDetail(noImages).content.state, "drafting");
  assert.deepEqual(await service.getDraftImageAssetIds("123"), []);
});

test("생성 중·삭제·발행된 원고의 이미지 선택은 저장하지 않는다", async () => {
  for (const changes of [{ rewriteStatus: "queued" }, { imageGenerationStatus: "queued" }, { deletedAt: now }, { publicationStatus: "published" }]) {
    const { service, input, state } = fixture();
    Object.assign(state(), changes);
    await assert.rejects(service.selectDraftImages("123", input(), "carrot"), /선택을 변경/);
    assert.equal(state().imageSelection, undefined);
  }
});

test("로그인한 사용자만 적용 가능하며 선택된 반려 이미지만 서명 URL로 복사한다", async context => {
  const { service, input } = fixture();
  const auth = new SessionAuthService({ username: "carrot", password: "test", sessionSecret: "selection-test-secret", secureCookie: false });
  const app = buildApp({ githubAutomation: service, auth, databaseProvider: "memory" });
  context.after(() => app.close());
  const url = "/api/contents/123/images/selection";
  assert.equal((await app.inject({ method: "POST", url, payload: input() })).statusCode, 401);
  const session = auth.login("carrot", "test", "local")!;
  const headers = { cookie: auth.sessionCookie(session), "x-requested-with": "dashboard", host: "dashboard.example" };
  const selected = await app.inject({ method: "POST", url, headers, payload: { ...input(["visual-01"]), acknowledgedRejectedIds: ["visual-01"] } });
  assert.equal(selected.statusCode, 200, selected.body);
  const copy = await app.inject({ method: "GET", url: "/api/contents/123/copy-assets", headers });
  const items = copy.json<{ items: Array<{ assetId: string; url: string }> }>().items;
  assert.deepEqual(items.map(item => item.assetId), ["visual-01"]);
  const image = new URL(items[0]!.url);
  assert.equal((await app.inject({ method: "GET", url: image.pathname + image.search })).statusCode, 200);
  assert.equal((selected.json().versions.at(-1).metadata.imagePackage as GeneratedImageManifest).visualQualityPassed, false);
});
