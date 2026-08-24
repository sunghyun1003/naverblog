import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { z } from "zod";
import { isDomainError } from "../domain/errors.js";
import { userRoles, type Actor, type UserRole } from "../domain/types.js";
import { randomId } from "../domain/utils.js";
import { draftToContent, draftToDetail } from "../services/github-content-mapper.js";
import type { AutomationDraftDetail, DashboardDraftState, GitHubAutomationService } from "../services/github-automation.js";
import { persistGitHubDraftDetail, persistGitHubDraftSummaries, persistGitHubTrends } from "../services/github-persistence.js";
import type { SessionAuthService } from "../services/session-auth.js";
import { createAutomationSystem, type AutomationSystem } from "../system.js";

const createContentSchema = z.object({
  title: z.string().trim().min(5).max(120),
  topic: z.string().trim().min(2).max(120),
  strategy: z.enum(["trend", "original"]),
  assigneeId: z.string().trim().min(1).nullable().optional(),
});

const approvalSchema = z.object({
  checks: z.object({ sources: z.boolean(), advertising: z.boolean() }),
});

const rejectionSchema = z.object({
  reason: z.string().trim()
    .min(5, "반려 사유는 5자 이상 입력해주세요.")
    .max(1000, "반려 사유는 1,000자 이하로 입력해주세요."),
});
const scheduleSchema = z.object({ scheduledAt: z.iso.datetime({ offset: true }) });
const publicationSchema = z.object({ externalUrl: z.url().refine((value) => value.startsWith("https://blog.naver.com/"), "네이버 블로그 URL을 입력하세요.") });
const loginSchema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });
const generationSchema = z.object({
  topic: z.string().trim().max(120).default(""),
  strategy: z.enum(["trend", "original"]).default("trend"),
});
const idParamsSchema = z.object({ id: z.string().min(1) });
const refreshQuerySchema = z.object({ refresh: z.enum(["true", "false"]).default("false") });

export interface AppOptions {
  system?: AutomationSystem;
  webOrigin?: string;
  logger?: boolean;
  databaseProvider?: "memory" | "postgres";
  auth?: SessionAuthService;
  githubAutomation?: GitHubAutomationService;
  serveWeb?: boolean;
}

function parseRoles(value: string | string[] | undefined): UserRole[] {
  const values = (Array.isArray(value) ? value.join(",") : value ?? "admin")
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is UserRole => userRoles.includes(role as UserRole));
  return values.length > 0 ? values : ["admin"];
}

function actorFrom(request: FastifyRequest, authenticatedUsername?: string): Actor {
  if (authenticatedUsername) return { id: authenticatedUsername, roles: ["admin"] };
  const header = request.headers["x-user-id"];
  const id = Array.isArray(header) ? header[0] : header;
  return { id: id?.trim() || "local-admin", roles: parseRoles(request.headers["x-user-roles"]) };
}

function idempotencyKey(request: FastifyRequest, scope: string): string {
  const header = request.headers["x-idempotency-key"];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() || `${scope}:${randomId()}`;
}

function draftWithState(draft: AutomationDraftDetail, state: DashboardDraftState): AutomationDraftDetail {
  return {
    ...draft,
    state,
    reviewStatus: state.reviewStatus,
    publicationStatus: state.publicationStatus,
    scheduledAt: state.scheduledAt,
    publishedAt: state.publishedAt,
    updatedAt: state.updatedAt,
  };
}

function freshness(source: "github" | "postgres-cache" | "local", stale: boolean, asOf: string | null, mirrorSynced = true) {
  return { source, stale, asOf, mirrorSynced };
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const system = options.system ?? createAutomationSystem();
  const origin = options.webOrigin ?? "http://127.0.0.1:5173";
  const databaseProvider = options.databaseProvider ?? "memory";
  const auth = options.auth;
  const githubAutomation = options.githubAutomation;
  const persistGitHubData = Boolean(githubAutomation) && databaseProvider === "postgres";

  async function listGitHubContents(forceRefresh = false) {
    const cachedBeforeSync = persistGitHubData ? await system.repository.listContents() : [];
    if (cachedBeforeSync.length && !forceRefresh) {
      return {
        items: cachedBeforeSync,
        freshness: freshness("postgres-cache", false, cachedBeforeSync[0]?.updatedAt ?? null),
      };
    }
    try {
      const knownRunIds = new Set(cachedBeforeSync.map((content) => content.id));
      const syncLimit = persistGitHubData ? (cachedBeforeSync.length ? 20 : 100) : 20;
      const drafts = await githubAutomation!.listDrafts(syncLimit, knownRunIds);
      if (persistGitHubData) {
        if (drafts.length) await persistGitHubDraftSummaries(system.repository, drafts);
        // GitHub 트리에서 새 실행 ID만 골라 읽어 API 호출량을 줄이고, Neon 전체 목록은 그대로 보존한다.
        const allContents = drafts.length ? await system.repository.listContents() : cachedBeforeSync;
        const listSource = cachedBeforeSync.length ? "postgres-cache" : "github";
        const asOf = listSource === "github" ? new Date().toISOString() : allContents[0]?.updatedAt ?? null;
        return { items: allContents, freshness: freshness(listSource, false, asOf) };
      }
      return { items: drafts.map(draftToContent), freshness: freshness("github", false, new Date().toISOString()) };
    } catch (error) {
      if (!persistGitHubData) throw error;
      const cached = await system.repository.listContents();
      if (!cached.length) throw error;
      app.log.warn({ err: error }, "GitHub 원고 목록 조회에 실패해 PostgreSQL 캐시를 사용합니다.");
      return { items: cached, freshness: freshness("postgres-cache", true, cached[0]?.updatedAt ?? null) };
    }
  }

  async function persistGitHubDetailSafely(draft: AutomationDraftDetail, operation: string): Promise<boolean> {
    if (!persistGitHubData) return true;
    try {
      await persistGitHubDraftDetail(system.repository, draft);
      return true;
    } catch (error) {
      app.log.warn(
        { err: error, contentId: draft.runId, operation },
        "GitHub 원고 상태는 저장됐지만 PostgreSQL 미러 동기화에 실패했습니다.",
      );
      return false;
    }
  }

  async function getGitHubDetail(id: string, forceRefresh = false) {
    if (persistGitHubData && !forceRefresh) {
      const cached = await system.repository.getContentDetail(id);
      if (cached?.versions.length) {
        return { ...cached, freshness: freshness("postgres-cache", false, cached.content.updatedAt) };
      }
    }
    let draft: AutomationDraftDetail;
    try {
      draft = await githubAutomation!.getDraft(id);
    } catch (error) {
      if (!persistGitHubData) throw error;
      const cached = await system.repository.getContentDetail(id);
      if (!cached) throw error;
      app.log.warn({ err: error, contentId: id }, "GitHub 원고 조회에 실패해 PostgreSQL 캐시를 사용합니다.");
      return { ...cached, freshness: freshness("postgres-cache", true, cached.content.updatedAt) };
    }
    if (!persistGitHubData) {
      return { ...draftToDetail(draft), freshness: freshness("github", false, new Date().toISOString()) };
    }
    try {
      const detail = await persistGitHubDraftDetail(system.repository, draft);
      return { ...detail, freshness: freshness("github", false, new Date().toISOString()) };
    } catch (error) {
      app.log.warn({ err: error, contentId: id }, "최신 GitHub 원고의 PostgreSQL 미러 동기화에 실패했습니다.");
      return { ...draftToDetail(draft), freshness: freshness("github", false, new Date().toISOString(), false) };
    }
  }

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Credentials", "true");
    reply.header("Access-Control-Allow-Headers", "Content-Type, X-User-Id, X-User-Roles, X-Idempotency-Key, X-Requested-With");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") return reply.status(204).send();
    if (!auth || !request.url.startsWith("/api/")) return;
    if (request.url.startsWith("/api/auth/login")) return;
    const session = auth.verifyCookie(request.headers.cookie);
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다.", details: null } });
    if (request.method !== "GET" && request.headers["x-requested-with"] !== "dashboard") {
      return reply.status(403).send({ error: { code: "INVALID_REQUEST_ORIGIN", message: "허용되지 않은 요청입니다.", details: null } });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (isDomainError(error)) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details ?? null } });
    }
    if (error instanceof z.ZodError) {
      const reasonIssue = error.issues.find((issue) => issue.path[0] === "reason");
      return reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: reasonIssue?.message ?? "요청 값이 올바르지 않습니다.",
          details: error.flatten(),
        },
      });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "처리 중 오류가 발생했습니다." } });
  });

  app.post("/api/auth/login", async (request, reply) => {
    if (!auth) return reply.status(503).send({ error: { code: "AUTH_NOT_CONFIGURED", message: "로그인이 설정되지 않았습니다.", details: null } });
    if (request.headers["x-requested-with"] !== "dashboard") {
      return reply.status(403).send({ error: { code: "INVALID_REQUEST_ORIGIN", message: "허용되지 않은 요청입니다.", details: null } });
    }
    const body = loginSchema.parse(request.body);
    const session = auth.login(body.username, body.password, request.ip);
    if (!session) return reply.status(401).send({ error: { code: "INVALID_CREDENTIALS", message: "아이디 또는 비밀번호가 올바르지 않습니다.", details: null } });
    reply.header("Set-Cookie", auth.sessionCookie(session));
    return { user: { id: session.username, name: session.username, roles: ["admin"] } };
  });
  app.get("/api/auth/session", async (request, reply) => {
    if (!auth) return { user: { id: "local-admin", name: "local-admin", roles: ["admin"] } };
    const session = auth.verifyCookie(request.headers.cookie);
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다.", details: null } });
    return { user: { id: session.username, name: session.username, roles: ["admin"] } };
  });
  app.post("/api/auth/logout", async (_request, reply) => {
    if (auth) reply.header("Set-Cookie", auth.clearCookie());
    return reply.status(204).send();
  });

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    adapters: githubAutomation ? "github-actions" : "mock",
    database: databaseProvider,
  }));
  app.get("/api/system/capabilities", async () => ({
    mode: githubAutomation ? "github-actions" : "local-mock",
    integrations: {
      ai: { configured: Boolean(githubAutomation), provider: githubAutomation ? "codex-oauth" : "mock" },
      naverSearch: { configured: Boolean(githubAutomation), provider: githubAutomation ? "naver-api" : "mock" },
      youtube: { configured: false, provider: "mock" },
      slack: { configured: false, provider: "mock" },
      publisher: { configured: Boolean(githubAutomation), provider: githubAutomation ? "copy-package" : "mock" },
      database: {
        configured: Boolean(githubAutomation) || databaseProvider === "postgres",
        provider: databaseProvider === "postgres" ? "postgres-mirror" : githubAutomation ? "github-contents" : databaseProvider,
      },
      automation: { configured: Boolean(githubAutomation), provider: githubAutomation ? "github-actions" : "mock" },
    },
  }));

  app.get("/api/automation/overview", async () => {
    if (!githubAutomation) return { mode: "mock", runs: [] };
    return { ...(await githubAutomation.capabilities()), runs: await githubAutomation.listWorkflowRuns() };
  });
  app.get("/api/automation/runs", async () => ({ items: githubAutomation ? await githubAutomation.listWorkflowRuns() : [] }));
  app.post("/api/automation/collect", async (_request, reply) => {
    if (!githubAutomation) return reply.status(503).send({ error: { code: "AUTOMATION_NOT_CONFIGURED", message: "GitHub 자동화가 연결되지 않았습니다.", details: null } });
    await githubAutomation.dispatch("collect");
    return reply.status(202).send({ accepted: true });
  });
  app.post("/api/automation/generate", async (request, reply) => {
    if (!githubAutomation) return reply.status(503).send({ error: { code: "AUTOMATION_NOT_CONFIGURED", message: "GitHub 자동화가 연결되지 않았습니다.", details: null } });
    const body = generationSchema.parse(request.body ?? {});
    await githubAutomation.dispatch("generate", { topic: body.topic, strategy: body.strategy });
    return reply.status(202).send({ accepted: true });
  });

  app.get("/api/contents", async (request) => {
    const query = refreshQuerySchema.parse(request.query);
    if (githubAutomation) return listGitHubContents(query.refresh === "true");
    return { items: await system.contentService.list(), freshness: freshness("local", false, new Date().toISOString()) };
  });
  app.post("/api/contents", async (request, reply) => {
    if (githubAutomation) {
      const body = createContentSchema.parse(request.body);
      await githubAutomation.dispatch("generate", { topic: body.topic, strategy: body.strategy });
      return reply.status(202).send({ accepted: true });
    }
    const body = createContentSchema.parse(request.body);
    const content = await system.contentService.create(
      { ...body, assigneeId: body.assigneeId ?? null, idempotencyKey: idempotencyKey(request, "content") },
      actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username),
    );
    return reply.status(201).send(content);
  });
  app.get("/api/contents/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const query = refreshQuerySchema.parse(request.query);
    if (githubAutomation) return getGitHubDetail(id, query.refresh === "true");
    return system.contentService.detail(id);
  });
  app.post("/api/contents/:id/pipeline", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const job = await system.contentService.runPipeline(id, idempotencyKey(request, `pipeline:${id}`), actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username));
    return reply.status(202).send(job);
  });
  app.post("/api/contents/:id/approve", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = approvalSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      if (!body.checks.sources || !body.checks.advertising) {
        return reply.status(409).send({ error: { code: "FINAL_CHECKS_REQUIRED", message: "수치·출처와 광고성 표현을 모두 확인해야 승인할 수 있습니다.", details: null } });
      }
      const draft = await githubAutomation.getDraft(id);
      if (draftToContent(draft).state !== "review_ready") {
        return reply.status(409).send({ error: { code: "CONTENT_NOT_REVIEW_READY", message: "검토 대기 상태의 원고만 승인할 수 있습니다.", details: null } });
      }
      const failedQualityCategories = draftToDetail(draft).qualityResults
        .filter((result) => result.status === "failed")
        .map((result) => result.category);
      if (!draft.toneSkillApplied || failedQualityCategories.length > 0) {
        return reply.status(409).send({
          error: {
            code: "CONTENT_QUALITY_FAILED",
            message: "품질 검사 실패 항목과 말투 보정을 해결한 뒤 승인할 수 있습니다.",
            details: { failedCategories: failedQualityCategories },
          },
        });
      }
      const state = await githubAutomation.updateState(id, {
        reviewStatus: "approved",
        checks: body.checks,
        reason: null,
        approvedBy: actor.id,
        rejectedBy: null,
        approvedAt: new Date().toISOString(),
        rejectedAt: null,
      }, actor.id, draft.state);
      const updatedDraft = draftWithState(draft, state);
      const mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "approve");
      return { ...draftToContent(updatedDraft), mirrorSynced };
    }
    return system.contentService.approve(id, body.checks, actor);
  });
  app.post("/api/contents/:id/reject", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = rejectionSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      const draft = await githubAutomation.getDraft(id);
      if (draftToContent(draft).state !== "review_ready") {
        return reply.status(409).send({ error: { code: "CONTENT_NOT_REVIEW_READY", message: "검토 대기 상태의 원고만 반려할 수 있습니다.", details: null } });
      }
      const state = await githubAutomation.updateState(id, {
        reviewStatus: "rejected",
        reason: body.reason,
        approvedBy: null,
        rejectedBy: actor.id,
        rejectedAt: new Date().toISOString(),
        approvedAt: null,
      }, actor.id, draft.state);
      const updatedDraft = draftWithState(draft, state);
      const mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "reject");
      return { ...draftToContent(updatedDraft), mirrorSynced };
    }
    return system.contentService.reject(id, body.reason, actor);
  });
  app.post("/api/contents/:id/schedule", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = scheduleSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      const draft = await githubAutomation.getDraft(id);
      if (draft.reviewStatus !== "approved" || draft.publicationStatus !== "none") {
        return reply.status(409).send({ error: { code: "CONTENT_NOT_SCHEDULABLE", message: "승인 후 아직 예약·발행되지 않은 원고만 예약할 수 있습니다.", details: null } });
      }
      const state = await githubAutomation.updateState(id, { publicationStatus: "scheduled", scheduledAt: body.scheduledAt }, actor.id, draft.state);
      const updatedDraft = draftWithState(draft, state);
      const mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "schedule");
      return { content: draftToContent(updatedDraft), publication: state, mirrorSynced };
    }
    return system.contentService.schedule(id, body.scheduledAt, actor);
  });
  app.post("/api/contents/:id/publish", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      const body = publicationSchema.parse(request.body);
      const draft = await githubAutomation.getDraft(id);
      if (draft.reviewStatus !== "approved" || draft.publicationStatus !== "scheduled") {
        return reply.status(409).send({ error: { code: "CONTENT_NOT_SCHEDULED", message: "승인 후 예약한 원고만 발행 완료로 처리할 수 있습니다.", details: null } });
      }
      const now = new Date().toISOString();
      const state = await githubAutomation.updateState(id, { publicationStatus: "published", publishedAt: now, externalUrl: body.externalUrl }, actor.id, draft.state);
      const updatedDraft = draftWithState(draft, state);
      const mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "publish");
      return { content: draftToContent(updatedDraft), publication: state, mirrorSynced };
    }
    return system.contentService.publish(id, actor);
  });
  function trendSnapshotFromCache(cached: Awaited<ReturnType<typeof system.repository.listTrendSignals>>) {
    return {
      collectionDate: cached[0]!.collectedAt.slice(0, 10),
      collectedAt: cached[0]!.collectedAt,
      queryCount: new Set(cached.map((trend) => trend.topicKey)).size,
      itemCount: cached.length,
      source: "postgres-cache",
      items: cached.map((trend) => ({
        title: trend.title,
        link: trend.url,
        description: "저장된 운영 데이터를 먼저 표시하고 최신 자료를 확인하고 있습니다.",
        bloggername: "NAVER 블로그",
        postdate: trend.publishedAt.slice(0, 10),
        candidateScore: trend.relevanceScore,
        matchedQueries: [trend.topicKey],
      })),
    };
  }

  app.get("/api/trends", async (request) => {
    const query = refreshQuerySchema.parse(request.query);
    if (githubAutomation) {
      if (persistGitHubData && query.refresh !== "true") {
        const cached = await system.repository.listTrendSignals();
        if (cached.length) return trendSnapshotFromCache(cached);
      }
      let trends;
      try {
        trends = await githubAutomation.getTrends();
      } catch (error) {
        if (!persistGitHubData) throw error;
        const cached = await system.repository.listTrendSignals();
        if (!cached.length) throw error;
        app.log.warn({ err: error }, "GitHub 트렌드 조회에 실패해 PostgreSQL 캐시를 사용합니다.");
        return trendSnapshotFromCache(cached);
      }
      if (persistGitHubData) {
        try {
          await persistGitHubTrends(system.repository, trends);
        } catch (error) {
          app.log.warn({ err: error }, "GitHub 트렌드의 PostgreSQL 동기화에 실패했습니다.");
        }
      }
      return trends;
    }
    const trends = await system.repository.listTrendSignals();
    return {
      collectionDate: new Date().toISOString().slice(0, 10),
      collectedAt: new Date().toISOString(),
      queryCount: new Set(trends.map((trend) => trend.topicKey)).size,
      itemCount: trends.length,
      source: "local-mock",
      items: trends.map((trend) => ({
        title: trend.title,
        link: trend.url,
        description: `${trend.sourceType}에서 수집한 로컬 검증용 콘텐츠입니다.`,
        bloggername: "로컬 샘플",
        postdate: trend.publishedAt.slice(0, 10),
        candidateScore: Math.round((trend.engagementScore + trend.relevanceScore + trend.trustScore) / 3),
        matchedQueries: [trend.topicKey],
      })),
    };
  });

  if (options.serveWeb) {
    app.register(fastifyStatic, { root: path.resolve(process.cwd(), "dist") });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/") && request.url !== "/health") return reply.sendFile("index.html");
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "요청한 경로를 찾을 수 없습니다.", details: null } });
    });
  }

  return app;
}
