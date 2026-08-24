import assert from "node:assert/strict";
import test from "node:test";
import { GitHubAutomationService } from "../server/services/github-automation.js";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function file(value: unknown): Response {
  const content = typeof value === "string" ? value : JSON.stringify(value);
  return json({ content: Buffer.from(content).toString("base64"), encoding: "base64", sha: "sha-1" });
}

test("GitHub Actions 실행 상태와 생성 원고를 읽는다", async () => {
  const requests: Array<{ url: string; method: string; body: string }> = [];
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: String(init?.body ?? "") });
    if (url.includes("/actions/workflows/collect.yml/runs")) return json({ workflow_runs: [{ id: 1, status: "completed", conclusion: "success", created_at: "2026-08-18T00:00:00Z", updated_at: "2026-08-18T00:01:00Z", html_url: "https://github.com/run/1" }] });
    if (url.includes("/actions/workflows/generate.yml/runs")) return json({ workflow_runs: [{ id: 2, status: "completed", conclusion: "success", created_at: "2026-08-18T01:00:00Z", updated_at: "2026-08-18T01:02:00Z", html_url: "https://github.com/run/2" }] });
    if (url.endsWith("/actions/workflows/generate.yml/dispatches")) return new Response(null, { status: 204 });
    if (url.includes("/git/trees/main")) return json({ truncated: false, tree: [
      { path: "output/drafts/2026-08-18/run-123/status.json", type: "blob" },
      { path: "output/drafts/2026-08-18/run-123/article.json", type: "blob" },
    ] });
    if (url.includes("status.json")) return file({ generatedAt: "2026-08-18T01:02:00Z", status: "TONE_REVIEW_COMPLETE", toneSkillApplied: true });
    if (url.includes("article.json")) return file({ planning: { topic: "실손보험" }, seo: { primaryKeyword: "실손보험" }, article: { title: "실손보험 확인법" }, sources: [] });
    if (url.includes("data/latest.json")) return file({
      source: "NAVER_SEARCH_BLOG_API",
      collectionDate: "2026-08-18",
      collectedAt: "2026-08-18T00:00:00Z",
      queryCount: 1,
      itemCount: 1,
      items: [{ title: "실손보험", link: "https://blog.naver.com/example/1", description: "확인법", bloggerName: "보험 블로그", postDate: "2026-08-18", candidateScore: 90, matchedQueries: ["실손보험"] }],
    });
    if (url.includes("dashboard/decisions/run-123.json")) return json({ message: "Not Found" }, 404);
    return json({ message: "Not Found" }, 404);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);

  const runs = await service.listWorkflowRuns();
  assert.equal(runs[0]?.workflow, "generate");
  const drafts = await service.listDrafts();
  assert.equal(drafts[0]?.title, "실손보험 확인법");
  assert.equal(drafts[0]?.toneSkillApplied, true);
  const knownDrafts = await service.listDrafts(20, new Set(["123"]));
  assert.deepEqual(knownDrafts, []);

  const trends = await service.getTrends();
  assert.equal(trends.items[0]?.bloggername, "보험 블로그");
  assert.equal(trends.items[0]?.postdate, "2026-08-18");

  await service.dispatch("generate", { topic: "실손보험", strategy: "trend" });
  const dispatch = requests.find((request) => request.method === "POST");
  assert.match(dispatch?.body ?? "", /실손보험/);
});

test("이미 읽은 원고 상태로 decision을 갱신할 때 원고를 다시 조회하지 않는다", async () => {
  const requests: Array<{ url: string; method: string; body: string }> = [];
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: String(init?.body ?? "") });
    if (url.includes("dashboard/decisions/run-456.json") && method === "GET") {
      return json({ message: "Not Found" }, 404);
    }
    if (url.includes("dashboard/decisions/run-456.json") && method === "PUT") {
      return json({ content: { sha: "new-sha" }, commit: { sha: "commit-sha" } });
    }
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const currentState = {
    schemaVersion: 1 as const,
    runId: "456",
    reviewStatus: "pending" as const,
    publicationStatus: "none" as const,
    checks: { sources: false, advertising: false },
    reason: null,
    approvedBy: null,
    rejectedBy: null,
    approvedAt: null,
    rejectedAt: null,
    scheduledAt: null,
    publishedAt: null,
    externalUrl: null,
    updatedAt: "2026-08-24T00:00:00.000Z",
    updatedBy: "system",
  };

  const state = await service.updateState(
    "456",
    { reviewStatus: "rejected", reason: "출처를 다시 확인해주세요." },
    "carrot",
    currentState,
  );

  assert.equal(state.reviewStatus, "rejected");
  assert.equal(state.updatedBy, "carrot");
  assert.equal(requests.some((request) => request.url.includes("/git/trees/")), false);
  assert.deepEqual(requests.map((request) => request.method), ["GET", "PUT"]);
});

test("동일 revision의 decision 동시 쓰기는 compare-and-set으로 하나만 허용한다", async () => {
  let stored: { state: unknown; sha: string } | null = null;
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (!url.includes("dashboard/decisions/run-789.json")) return json({ message: "Unexpected request" }, 500);
    if (method === "GET") {
      if (!stored) return json({ message: "Not Found" }, 404);
      return json({
        content: Buffer.from(JSON.stringify(stored.state)).toString("base64"),
        encoding: "base64",
        sha: stored.sha,
      });
    }
    if (method === "PUT") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { content?: string; sha?: string };
      if (stored && body.sha !== stored.sha) return json({ message: "sha does not match" }, 422);
      stored = {
        state: JSON.parse(Buffer.from(body.content ?? "", "base64").toString("utf8")),
        sha: "sha-after-write",
      };
      return json({ content: { sha: stored.sha }, commit: { sha: "commit-sha" } });
    }
    return json({ message: "Method not allowed" }, 405);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const currentState = {
    schemaVersion: 1 as const,
    runId: "789",
    reviewStatus: "pending" as const,
    publicationStatus: "none" as const,
    checks: { sources: false, advertising: false },
    reason: null,
    approvedBy: null,
    rejectedBy: null,
    approvedAt: null,
    rejectedAt: null,
    scheduledAt: null,
    publishedAt: null,
    externalUrl: null,
    updatedAt: "2026-08-24T00:00:00.000Z",
    updatedBy: "system",
  };

  const results = await Promise.allSettled([
    service.updateState("789", { reviewStatus: "approved" }, "approver", currentState),
    service.updateState("789", { reviewStatus: "rejected", reason: "수정이 필요합니다." }, "reviewer", currentState),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.equal((rejected?.reason as { code?: string }).code, "CONTENT_STATE_CONFLICT");
  assert.ok(["approved", "rejected"].includes((stored?.state as { reviewStatus: string }).reviewStatus));
});
