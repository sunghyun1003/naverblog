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
    if (url.endsWith("/actions/workflows/rewrite.yml/dispatches")) return new Response(null, { status: 204 });
    if (url.endsWith("/actions/workflows/images.yml/dispatches")) return new Response(null, { status: 204 });
    if (url.includes("/git/trees/main")) return json({ truncated: false, tree: [
      { path: "output/drafts/2026-08-18/run-123/status.json", type: "blob" },
      { path: "output/drafts/2026-08-18/run-123/article.json", type: "blob" },
    ] });
    if (url.includes("status.json")) return file({ generatedAt: "2026-08-18T01:02:00Z", status: "TONE_REVIEW_COMPLETE", toneSkillApplied: true, toneVerdict: "PASS" });
    if (url.includes("article.json")) return file({ planning: { topic: "실손보험" }, seo: { primaryKeyword: "실손보험" }, article: { title: "실손보험 확인법" }, sources: [] });
    if (url.includes("data/latest.json")) return file({
      source: "NAVER_SEARCH_BLOG_API",
      collectionDate: "2026-08-18",
      collectedAt: "2026-08-18T00:00:00Z",
      queryCount: 1,
      requestCount: 2,
      itemCount: 1,
      collectionStrategy: { sorts: ["sim", "date"], resultsPerQuery: 20, historyWindowDays: 28, rankMeaning: "API 정확도순" },
      unavailableMetrics: { views: "NAVER API HUB 미제공", likes: "NAVER API HUB 미제공", comments: "NAVER API HUB 미제공" },
      searchTrend: { status: "ok", startDate: "2026-07-22", endDate: "2026-08-18", windowDays: 28, recentDays: 7, baselineDays: 21, requestCount: 1 },
      items: [{ title: "실손보험", link: "https://blog.naver.com/example/1", description: "확인법", bloggerName: "보험 블로그", postDate: "2026-08-18", candidateScore: 90, matchedQueries: ["실손보험"], bestSimilarityRank: 2, bestRecentRank: 4, observedDays: 3, similarityTopDays: 2, bestSearchTrend: { query: "실손보험", direction: "rising", changePercent: 25, momentumScore: 15 }, scoreBreakdown: { total: 83, similarityRank: 30, keywordRelevance: 15, relativeDemand: 8, trendMomentum: 15, fourWeekPersistence: 6, freshness: 4, intentFit: 5 } }],
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
  assert.equal(drafts[0]?.toneVerdict, "PASS");
  const knownDrafts = await service.listDrafts(20, new Set(["123"]));
  assert.deepEqual(knownDrafts, []);

  const trends = await service.getTrends();
  assert.equal(trends.items[0]?.bloggername, "보험 블로그");
  assert.equal(trends.items[0]?.postdate, "2026-08-18");
  assert.equal(trends.items[0]?.bestSimilarityRank, 2);
  assert.equal(trends.items[0]?.observedDays, 3);
  assert.equal(trends.items[0]?.scoreBreakdown?.keywordRelevance, 15);
  assert.equal(trends.requestCount, 2);
  assert.equal(trends.unavailableMetrics?.views, "NAVER API HUB 미제공");
  assert.equal(trends.searchTrend?.status, "ok");
  assert.equal(trends.items[0]?.bestSearchTrend?.direction, "rising");

  await service.dispatch("generate", { topic: "실손보험", strategy: "trend" });
  await service.dispatch("rewrite", { run_id: "123" });
  await service.dispatch("rewrite", { run_id: "123", mode: "tone_resume" });
  await service.dispatch("images", { run_id: "123" });
  const dispatches = requests.filter((request) => request.method === "POST");
  assert.match(dispatches[0]?.body ?? "", /실손보험/);
  assert.match(dispatches[1]?.url ?? "", /rewrite\.yml\/dispatches$/);
  assert.match(dispatches[1]?.body ?? "", /"run_id":"123"/);
  assert.match(dispatches[2]?.url ?? "", /rewrite\.yml\/dispatches$/);
  assert.match(dispatches[2]?.body ?? "", /"mode":"tone_resume"/);
  assert.match(dispatches[3]?.url ?? "", /images\.yml\/dispatches$/);
  assert.match(dispatches[3]?.body ?? "", /"run_id":"123"/);
});

test("1MB를 넘는 트렌드 스냅샷은 Git Blob API로 읽는다", async () => {
  const latest = {
    collectionDate: "2026-08-31",
    collectedAt: "2026-08-31T00:00:00Z",
    queryCount: 1,
    itemCount: 1,
    items: [{ title: "자동차보험", link: "https://example.com", description: "후보", bloggerName: "블로그", postDate: "2026-08-31" }],
  };
  const encoded = Buffer.from(JSON.stringify(latest)).toString("base64");
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/contents/data/latest.json")) return json({ message: "This API returns blobs up to 1 MB" }, 403);
    if (url.includes("/git/trees/main")) return json({ truncated: false, tree: [{ path: "data/latest.json", type: "blob", sha: "latest-sha" }] });
    if (url.includes("/git/blobs/latest-sha")) return json({ content: encoded, encoding: "base64" });
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const trends = await service.getTrends();
  assert.equal(trends.collectionDate, "2026-08-31");
  assert.equal(trends.items[0]?.title, "자동차보험");
});

test("트렌드 조회는 짧게 캐시하고 명시적 새로고침만 원격 파일을 다시 읽는다", async () => {
  let latestReads = 0;
  const latest = {
    collectionDate: "2026-09-02",
    collectedAt: "2026-09-02T00:00:00Z",
    queryCount: 1,
    itemCount: 1,
    items: [{ title: "자동차보험", link: "https://example.com", description: "후보", bloggerName: "블로그", postDate: "2026-09-02" }],
  };
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/contents/data/latest.json")) {
      latestReads += 1;
      return file(latest);
    }
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);

  await Promise.all([service.getTrends(), service.getTrends(), service.getTrends()]);
  assert.equal(latestReads, 1);
  await service.getTrends();
  assert.equal(latestReads, 1);
  await service.getTrends(true);
  assert.equal(latestReads, 2);
});

test("1MB를 넘는 파일이 encoding none으로 반환돼도 Git Blob API로 읽는다", async () => {
  const latest = {
    collectionDate: "2026-09-01",
    collectedAt: "2026-08-31T23:38:34Z",
    queryCount: 20,
    itemCount: 1,
    items: [{ title: "오늘 자동차보험", link: "https://example.com/today", postDate: "2026-09-01" }],
  };
  const encoded = Buffer.from(JSON.stringify(latest)).toString("base64");
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/contents/data/latest.json")) return json({ content: "", encoding: "none", size: 1_933_215, sha: "latest-sha" });
    if (url.includes("/git/trees/main")) return json({ truncated: false, tree: [{ path: "data/latest.json", type: "blob", sha: "latest-sha" }] });
    if (url.includes("/git/blobs/latest-sha")) return json({ content: encoded, encoding: "base64" });
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const trends = await service.getTrends();
  assert.equal(trends.collectionDate, "2026-09-01");
  assert.equal(trends.items[0]?.title, "오늘 자동차보험");
});

test("대시보드 일정 설정을 워크플로우와 설정 파일에 한 커밋으로 반영한다", async () => {
  const writtenBlobs: string[] = [];
  const workflowSource = `name: test\n\non:\n  # dashboard-schedule:start\n  schedule:\n    - cron: \"0 7 * * *\"\n      timezone: \"Asia/Seoul\"\n  # dashboard-schedule:end\n  workflow_dispatch:\n`;
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes(".github/workflows/collect.yml") || url.includes(".github/workflows/generate.yml")) return file(workflowSource);
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: "head-sha" } });
    if (url.endsWith("/git/commits/head-sha")) return json({ tree: { sha: "base-tree" } });
    if (url.endsWith("/git/blobs") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { content: string };
      writtenBlobs.push(body.content);
      return json({ sha: `blob-${writtenBlobs.length}` });
    }
    if (url.endsWith("/git/trees") && method === "POST") return json({ sha: "next-tree" });
    if (url.endsWith("/git/commits") && method === "POST") return json({ sha: "next-commit" });
    if (url.endsWith("/git/refs/heads/main") && method === "PATCH") return json({ ref: "refs/heads/main" });
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const settings = {
    schemaVersion: 1 as const,
    timezone: "Asia/Seoul" as const,
    collection: { enabled: true, frequency: "weekdays" as const, time: "06:20", weekday: 1 },
    generation: { enabled: true, frequency: "daily" as const, time: "07:10", weekday: 1, count: 2 },
  };
  await service.updateAutomationSettings(settings);
  assert.equal(writtenBlobs.length, 3);
  assert.ok(writtenBlobs.some((value) => value.includes('"frequency": "weekdays"')));
  const generateWorkflow = writtenBlobs.find((value) => value.includes("dashboard-schedule:start") && value.includes('cron: "10 7 * * *"')) ?? "";
  assert.match(generateWorkflow, /cron: "10 7 \* \* \*"/);
  assert.equal((generateWorkflow.match(/cron:/g) ?? []).length, 1);
});

test("자동화 연결 진단은 저장소를 변경하지 않고 권한을 확인한다", async () => {
  const requests: string[] = [];
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/repos/owner/repo")) return json({ permissions: { push: true } });
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: "head" } });
    if (url.includes(".github/workflows/collect.yml") || url.includes(".github/workflows/generate.yml")) return file("name: test\n");
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const result = await service.diagnoseAutomationConnection();
  assert.equal(result.status, "ok");
  assert.equal(result.repositoryReadable, true);
  assert.equal(result.branchReadable, true);
  assert.equal(result.workflowsReadable, true);
  assert.equal(result.canWrite, true);
  assert.match(result.message, /저장 권한/);
  assert.ok(requests.some((url) => url.endsWith("/repos/owner/repo")));
});

test("자동화 연결 진단은 쓰기 권한 부족을 설정 화면에 알린다", async () => {
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/repos/owner/repo")) return json({ permissions: { push: false } });
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: "head" } });
    if (url.includes(".github/workflows/collect.yml") || url.includes(".github/workflows/generate.yml")) return file("name: test\n");
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "read-only" }, mockFetch);
  const result = await service.diagnoseAutomationConnection();
  assert.equal(result.status, "attention");
  assert.equal(result.canWrite, false);
  assert.match(result.message, /쓰기 권한/);
});

test("실패 단계와 Codex 사용량을 실행 이력으로 합친다", async () => {
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/actions/runs/55/jobs")) return json({ jobs: [{ name: "generate", conclusion: "failure", status: "completed", steps: [{ name: "원고 생성", conclusion: "failure", status: "completed" }] }] });
    if (url.includes("/actions/runs?")) return json({ workflow_runs: [{ id: 55, status: "completed", conclusion: "failure", created_at: "2026-08-30T00:00:00Z", updated_at: "2026-08-30T00:05:00Z", html_url: "https://github.com/run/55", event: "schedule", path: ".github/workflows/generate.yml@refs/heads/main" }] });
    if (url.includes("/git/trees/main")) return json({ truncated: false, tree: [{ path: "output/history/55-generate.json", type: "blob" }] });
    if (url.includes("output/history/55-generate.json") || url.includes("output%2Fhistory%2F55-generate.json")) return file({ workflowRunId: 55, workflow: "generate", job: "generate", event: "schedule", status: "failure", startedAt: "2026-08-30T00:00:00Z", finishedAt: "2026-08-30T00:05:00Z", durationSeconds: 300, contentRunId: "55", codex: { calls: 5, inputTokens: 1000, outputTokens: 200, totalTokens: 1200 } });
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const items = await service.listAutomationHistory();
  assert.equal(items[0]?.failedStage, "원고 생성");
  assert.equal(items[0]?.codex.totalTokens, 1200);
  assert.equal(items[0]?.event, "schedule");
});

test("이미지 manifest에 등록된 파일만 GitHub에서 읽는다", async () => {
  const imageBytes = Buffer.from("generated-image");
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/git/trees/main")) return json({ truncated: false, tree: [
      { path: "output/drafts/2026-08-28/run-555/status.json", type: "blob" },
      { path: "output/drafts/2026-08-28/run-555/images/manifest.json", type: "blob" },
      { path: "output/drafts/2026-08-28/run-555/images/hero.jpg", type: "blob" },
    ] });
    if (url.includes("images%2Fmanifest.json") || url.includes("images/manifest.json")) return file({
      status: "ready",
      assets: [{ id: "hero", path: "hero.jpg" }],
    });
    if (url.includes("hero.jpg")) return json({ content: imageBytes.toString("base64"), encoding: "base64", sha: "image-sha" });
    return json({ message: "Not Found" }, 404);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);

  const image = await service.getDraftImage("555", "hero");
  assert.deepEqual(image.body, imageBytes);
  assert.equal(image.contentType, "image/jpeg");
  assert.equal(image.etag, "image-sha");
  await assert.rejects(() => service.getDraftImage("555", "not-in-manifest"), (error: unknown) => (error as { code?: string }).code === "IMAGE_NOT_FOUND");
});

test("재작성된 원고와 이전 버전을 함께 읽는다", async () => {
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/git/trees/main")) return json({ truncated: false, tree: [
      { path: "output/drafts/2026-08-24/run-987/status.json", type: "blob" },
      { path: "output/drafts/2026-08-24/run-987/article.json", type: "blob" },
      { path: "output/drafts/2026-08-24/run-987/article.md", type: "blob" },
      { path: "output/drafts/2026-08-24/run-987/copy-package.txt", type: "blob" },
      { path: "output/drafts/2026-08-24/run-987/sources.md", type: "blob" },
      { path: "output/drafts/2026-08-24/run-987/revisions/v1/status.json", type: "blob" },
      { path: "output/drafts/2026-08-24/run-987/revisions/v1/article.json", type: "blob" },
      { path: "output/drafts/2026-08-24/run-987/revisions/v1/article.md", type: "blob" },
      { path: "output/drafts/2026-08-24/run-987/revisions/v1/copy-package.txt", type: "blob" },
    ] });
    if (url.includes("dashboard/decisions/run-987.json")) return file({
      schemaVersion: 1,
      runId: "987",
      reviewStatus: "pending",
      publicationStatus: "none",
      checks: { sources: false, advertising: false },
      reason: null,
      approvedAt: null,
      rejectedAt: null,
      scheduledAt: null,
      publishedAt: null,
      externalUrl: null,
      revision: 2,
      rewriteStatus: "completed",
      rewrittenAt: "2026-08-24T02:00:00.000Z",
      updatedAt: "2026-08-24T02:00:00.000Z",
      updatedBy: "github-actions",
    });
    if (url.includes("revisions/v1/status.json")) return file({ generatedAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:05:00.000Z", revision: 1 });
    if (url.includes("revisions/v1/article.json")) return file({ article: { title: "초기 원고" } });
    if (url.includes("revisions/v1/article.md")) return file("# 초기 원고");
    if (url.includes("revisions/v1/copy-package.txt")) return file("초기 복사본");
    if (url.includes("/status.json")) return file({ generatedAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T02:00:00.000Z", revision: 2, status: "TONE_REVIEW_COMPLETE", toneSkillApplied: true });
    if (url.includes("/article.json")) return file({ planning: { topic: "보험" }, seo: { primaryKeyword: "보험" }, article: { title: "수정 원고" }, sources: [] });
    if (url.includes("/article.md")) return file("# 수정 원고");
    if (url.includes("/copy-package.txt")) return file("수정 복사본");
    if (url.includes("/sources.md")) return file("- 출처");
    return json({ message: "Not Found" }, 404);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);

  const draft = await service.getDraft("987");
  assert.equal(draft.revision, 2);
  assert.equal(draft.rewriteStatus, "completed");
  assert.equal(draft.title, "수정 원고");
  assert.equal(draft.revisions?.length, 1);
  assert.equal(draft.revisions?.[0]?.title, "초기 원고");
  assert.equal(draft.revisions?.[0]?.articleMarkdown, "# 초기 원고");
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

test("원고 영구 삭제는 GitHub 파일과 결정 파일을 한 커밋으로 제거한다", async () => {
  const requests: Array<{ url: string; method: string; body: string }> = [];
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = String(init?.body ?? "");
    requests.push({ url, method, body });
    if (url.includes("/git/trees/main?recursive=1")) return json({ truncated: false, tree: [
      { path: "output/drafts/2026-08-29/run-123/status.json", type: "blob" },
      { path: "output/drafts/2026-08-29/run-123/article.md", type: "blob" },
      { path: "output/drafts/2026-08-29/run-123/images/hero.jpg", type: "blob" },
      { path: "dashboard/decisions/run-123.json", type: "blob" },
      { path: "output/drafts/2026-08-29/run-999/status.json", type: "blob" },
    ] });
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: "head-sha" } });
    if (url.endsWith("/git/commits/head-sha")) return json({ tree: { sha: "base-tree-sha" } });
    if (url.endsWith("/git/trees") && method === "POST") return json({ sha: "delete-tree-sha" });
    if (url.endsWith("/git/commits") && method === "POST") return json({ sha: "delete-commit-sha" });
    if (url.endsWith("/git/refs/heads/main") && method === "PATCH") return json({ ref: "refs/heads/main" });
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const result = await service.deleteDraftPermanently("123", {
    schemaVersion: 1,
    runId: "123",
    reviewStatus: "pending",
    publicationStatus: "none",
    checks: { sources: false, advertising: false },
    reason: null,
    approvedAt: null,
    rejectedAt: null,
    scheduledAt: null,
    publishedAt: null,
    externalUrl: null,
    updatedAt: "2026-08-29T00:00:00.000Z",
    updatedBy: "system",
  });

  assert.equal(result.deletedFiles, 4);
  assert.deepEqual(requests.map((request) => request.method), ["GET", "GET", "GET", "POST", "POST", "PATCH"]);
  const treeBody = JSON.parse(requests[3]!.body) as { tree: Array<{ path: string; sha: string | null }> };
  assert.deepEqual(treeBody.tree.map((entry) => entry.path).sort(), [
    "dashboard/decisions/run-123.json",
    "output/drafts/2026-08-29/run-123/article.md",
    "output/drafts/2026-08-29/run-123/images/hero.jpg",
    "output/drafts/2026-08-29/run-123/status.json",
  ]);
  assert.ok(treeBody.tree.every((entry) => entry.sha === null));
});

test("failed image candidates are available only through explicit preview", async () => {
  const imageBytes = Buffer.from("failed-candidate-image");
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/git/trees/main")) return json({ truncated: false, tree: [
      { path: "output/drafts/2026-09-02/run-777/status.json", type: "blob" },
      { path: "output/drafts/2026-09-02/run-777/images/manifest.json", type: "blob" },
      { path: "output/drafts/2026-09-02/run-777/images/hero.jpg", type: "blob" },
    ] });
    if (url.includes("images%2Fmanifest.json") || url.includes("images/manifest.json")) return file({
      status: "failed",
      assets: [{ id: "hero", path: "hero.jpg" }],
    });
    if (url.includes("hero.jpg")) return json({ content: imageBytes.toString("base64"), encoding: "base64", sha: "failed-image-sha" });
    return json({ message: "Not Found" }, 404);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  await assert.rejects(() => service.getDraftImage("777", "hero"), (error: unknown) => (error as { code?: string }).code === "IMAGE_NOT_FOUND");
  const preview = await service.getDraftImage("777", "hero", { allowFailed: true });
  assert.deepEqual(preview.body, imageBytes);
});

test("기본 일정 저장 시 추가 복구 일정은 유지하고 자동 실행을 끄면 함께 제거한다", async () => {
  const workflowSource = `name: test\n\non:\n  # dashboard-schedule:start\n  schedule:\n    - cron: "0 7 * * *"\n      timezone: "Asia/Seoul"\n    # post-reset recovery\n    - cron: "15 9 * * *"\n      timezone: "Asia/Seoul"\n  # dashboard-schedule:end\n  workflow_dispatch:\n`;
  const written: string[] = [];
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes(".github/workflows/collect.yml") || url.includes(".github/workflows/generate.yml")) return file(workflowSource);
    if (url.endsWith("/git/ref/heads/main") && method === "GET") return json({ object: { sha: "head-sha" } });
    if (url.endsWith("/git/commits/head-sha")) return json({ tree: { sha: "base-tree" } });
    if (url.endsWith("/git/blobs") && method === "POST") {
      written.push((JSON.parse(String(init?.body)) as { content: string }).content);
      return json({ sha: `blob-${written.length}` });
    }
    if (url.endsWith("/git/trees") && method === "POST") return json({ sha: "next-tree" });
    if (url.endsWith("/git/commits") && method === "POST") return json({ sha: "next-commit" });
    if (url.endsWith("/git/refs/heads/main") && method === "PATCH") return json({ ref: "refs/heads/main" });
    return json({ message: "Unexpected request" }, 500);
  }) as typeof fetch;
  const service = new GitHubAutomationService({ owner: "owner", repository: "repo", branch: "main", token: "token" }, mockFetch);
  const enabled = {
    schemaVersion: 1 as const,
    timezone: "Asia/Seoul" as const,
    collection: { enabled: true, frequency: "daily" as const, time: "06:30", weekday: 1 },
    generation: { enabled: true, frequency: "daily" as const, time: "07:00", weekday: 1, count: 1 },
  };
  await service.updateAutomationSettings(enabled);
  const generation = written.find((value) => value.includes("post-reset recovery")) ?? "";
  assert.match(generation, /cron: "15 9 \* \* \*"/);

  written.length = 0;
  await service.updateAutomationSettings({ ...enabled, generation: { ...enabled.generation, enabled: false } });
  const disabledGeneration = written[2] ?? "";
  assert.doesNotMatch(disabledGeneration, /cron:/);
});
