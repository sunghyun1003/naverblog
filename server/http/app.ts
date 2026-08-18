import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { z } from "zod";
import { isDomainError } from "../domain/errors.js";
import { userRoles, type Actor, type UserRole } from "../domain/types.js";
import { randomId } from "../domain/utils.js";
import { draftToContent, draftToDetail } from "../services/github-content-mapper.js";
import type { GitHubAutomationService } from "../services/github-automation.js";
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

const rejectionSchema = z.object({ reason: z.string().trim().min(5).max(1000) });
const scheduleSchema = z.object({ scheduledAt: z.iso.datetime({ offset: true }) });
const publicationSchema = z.object({ externalUrl: z.url().refine((value) => value.startsWith("https://blog.naver.com/"), "네이버 블로그 URL을 입력하세요.") });
const loginSchema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });
const generationSchema = z.object({
  topic: z.string().trim().max(120).default(""),
  strategy: z.enum(["trend", "original"]).default("trend"),
});
const idParamsSchema = z.object({ id: z.string().min(1) });

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

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const system = options.system ?? createAutomationSystem();
  const origin = options.webOrigin ?? "http://127.0.0.1:5173";
  const databaseProvider = options.databaseProvider ?? "memory";
  const auth = options.auth;
  const githubAutomation = options.githubAutomation;

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
      return reply.status(400).send({ error: { code: "INVALID_REQUEST", message: "요청 값이 올바르지 않습니다.", details: error.flatten() } });
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
      database: { configured: databaseProvider === "postgres", provider: databaseProvider },
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

  app.get("/api/contents", async () => ({
    items: githubAutomation ? (await githubAutomation.listDrafts()).map(draftToContent) : await system.contentService.list(),
  }));
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
    if (githubAutomation) return draftToDetail(await githubAutomation.getDraft(id));
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
      const state = await githubAutomation.updateState(id, {
        reviewStatus: "approved",
        checks: body.checks,
        reason: null,
        approvedAt: new Date().toISOString(),
        rejectedAt: null,
      }, actor.id);
      return { ...draftToContent(await githubAutomation.getDraft(id)), state };
    }
    return system.contentService.approve(id, body.checks, actor);
  });
  app.post("/api/contents/:id/reject", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = rejectionSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      const state = await githubAutomation.updateState(id, {
        reviewStatus: "rejected",
        reason: body.reason,
        rejectedAt: new Date().toISOString(),
        approvedAt: null,
      }, actor.id);
      return { ...draftToContent(await githubAutomation.getDraft(id)), state };
    }
    return system.contentService.reject(id, body.reason, actor);
  });
  app.post("/api/contents/:id/schedule", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = scheduleSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      const draft = await githubAutomation.getDraft(id);
      if (draft.reviewStatus !== "approved") return reply.status(409).send({ error: { code: "CONTENT_NOT_APPROVED", message: "승인된 원고만 예약할 수 있습니다.", details: null } });
      const state = await githubAutomation.updateState(id, { publicationStatus: "scheduled", scheduledAt: body.scheduledAt }, actor.id);
      return { content: draftToContent(await githubAutomation.getDraft(id)), publication: state };
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
      const state = await githubAutomation.updateState(id, { publicationStatus: "published", publishedAt: now, externalUrl: body.externalUrl }, actor.id);
      return { content: draftToContent(await githubAutomation.getDraft(id)), publication: state };
    }
    return system.contentService.publish(id, actor);
  });
  app.get("/api/trends", async () => {
    if (githubAutomation) return githubAutomation.getTrends();
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
    app.register(fastifyStatic, { root: path.resolve(process.cwd(), "dist"), wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/") && request.url !== "/health") return reply.sendFile("index.html");
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "요청한 경로를 찾을 수 없습니다.", details: null } });
    });
  }

  return app;
}
