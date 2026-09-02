import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { z } from "zod";
import { isDomainError } from "../domain/errors.js";
import { userRoles, type Actor, type UserRole } from "../domain/types.js";
import { randomId } from "../domain/utils.js";
import { draftToContent, draftToDetail } from "../services/github-content-mapper.js";
import { GitHubAutomationError, type AutomationDraftDetail, type AutomationSettings, type DashboardDraftState, type GitHubAutomationService } from "../services/github-automation.js";
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
const editContentSchema = z.object({
  title: z.string().trim().min(5, "제목은 5자 이상 입력해주세요.").max(120),
  body: z.string().trim().min(20, "원고는 20자 이상 입력해주세요.").max(100_000),
  reason: z.string().trim().max(1000).nullable().default(null),
});
const bulkDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(50),
});
const scheduleSchema = z.object({ scheduledAt: z.iso.datetime({ offset: true }) });
const publicationSchema = z.object({ externalUrl: z.url().refine((value) => value.startsWith("https://blog.naver.com/"), "네이버 블로그 URL을 입력하세요.") });
const loginSchema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });
const generationSchema = z.object({
  topic: z.string().trim().max(120).default(""),
  strategy: z.enum(["trend", "original"]).default("trend"),
});
const idParamsSchema = z.object({ id: z.string().min(1) });
const imageParamsSchema = z.object({ id: z.string().min(1), assetId: z.string().regex(/^[a-z0-9-]+$/) });
const imageGenerationSchema = z.object({
  assetId: z.string().regex(/^[a-z0-9-]+$/).optional(),
  feedback: z.string().trim().max(1000).optional(),
}).default({});
const refreshQuerySchema = z.object({ refresh: z.enum(["true", "false"]).default("false") });
const automationScheduleSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(["daily", "weekdays", "weekly"]),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "시간은 24시간 형식으로 입력해주세요."),
  weekday: z.number().int().min(0).max(6),
});
const automationSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  timezone: z.literal("Asia/Seoul"),
  collection: automationScheduleSchema,
  generation: automationScheduleSchema.extend({ count: z.number().int().min(1).max(3) }),
});
const publicImageQuerySchema = z.object({
  expires: z.coerce.number().int().positive(),
  signature: z.string().min(20).max(200),
});
// Failed candidates are previewable only from the authenticated dashboard.
// Signed/public image URLs remain limited to quality-gated ready packages.
const imagePreviewQuerySchema = z.object({
  preview: z.enum(["true", "false"]).default("false"),
  v: z.string().optional(),
});

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
  const manualEdit = state.manualEdit;
  const article = manualEdit
    ? { ...draft.article, article: { ...draft.article.article, title: manualEdit.title } }
    : draft.article;
  return {
    ...draft,
    title: manualEdit?.title ?? draft.title,
    articleMarkdown: manualEdit?.body ?? draft.articleMarkdown,
    copyPackage: manualEdit?.body ?? draft.copyPackage,
    article,
    state,
    reviewStatus: state.reviewStatus,
    publicationStatus: state.publicationStatus,
    scheduledAt: state.scheduledAt,
    publishedAt: state.publishedAt,
    revision: state.revision ?? draft.revision ?? 1,
    rewriteStatus: state.rewriteStatus ?? draft.rewriteStatus ?? null,
    deleted: Boolean(state.deletedAt),
    updatedAt: state.updatedAt,
  };
}

// A failed quality check is still a valid review outcome: the reviewer must be
// able to reject it and send it back for rewriting. Only an active pipeline or
// a terminal publication state should block rejection.
const activePipelineMarkers = [
  "QUEUED",
  "RUNNING",
  "IN_PROGRESS",
  "COLLECTING",
  "GENERATING",
  "DRAFTING",
  "HUMANIZING",
  "REWRITING",
  "PENDING",
];

function canRejectGitHubDraft(draft: AutomationDraftDetail): boolean {
  const autoReady = draft.state?.autoApproved === true;
  if (draft.deleted || (!autoReady && draft.reviewStatus !== "pending") || draft.publicationStatus !== "none") return false;
  const pipelineStatus = (draft.pipelineStatus ?? "UNKNOWN").toUpperCase();
  return !activePipelineMarkers.some((marker) => pipelineStatus.includes(marker));
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

  async function persistGitHubDetailWithRetry(draft: AutomationDraftDetail): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await persistGitHubDraftDetail(system.repository, draft);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      }
    }
    throw lastError;
  }

  async function listGitHubContents(forceRefresh = false) {
    const cachedBeforeSync = persistGitHubData ? await system.repository.listContents() : [];
    if (cachedBeforeSync.length && !forceRefresh) {
      return {
        items: cachedBeforeSync.filter((content) => content.state !== "deleted"),
        freshness: freshness("postgres-cache", false, cachedBeforeSync[0]?.updatedAt ?? null),
      };
    }
    try {
      // An explicit refresh is also a reconciliation pass: include existing
      // run IDs so image/rewrite/status changes made by GitHub Actions reach
      // the mirror. The normal path keeps the cheap "new IDs only" sync.
      const knownRunIds = forceRefresh ? new Set<string>() : new Set(cachedBeforeSync.map((content) => content.id));
      const syncLimit = persistGitHubData ? (forceRefresh ? Math.max(20, Math.min(100, cachedBeforeSync.length + 10)) : cachedBeforeSync.length ? 20 : 100) : 20;
      const drafts = await githubAutomation!.listDrafts(syncLimit, knownRunIds);
      if (persistGitHubData) {
        if (drafts.length) await persistGitHubDraftSummaries(system.repository, drafts);
        // GitHub 트리에서 새 실행 ID만 골라 읽어 API 호출량을 줄이고, Neon 전체 목록은 그대로 보존한다.
        const allContents = drafts.length ? await system.repository.listContents() : cachedBeforeSync;
        const listSource = cachedBeforeSync.length ? "postgres-cache" : "github";
        const asOf = listSource === "github" ? new Date().toISOString() : allContents[0]?.updatedAt ?? null;
        return { items: allContents.filter((content) => content.state !== "deleted"), freshness: freshness(listSource, false, asOf) };
      }
      return { items: drafts.map(draftToContent).filter((content) => content.state !== "deleted"), freshness: freshness("github", false, new Date().toISOString()) };
    } catch (error) {
      if (!persistGitHubData) throw error;
      const cached = await system.repository.listContents();
      if (!cached.length) throw error;
      app.log.warn({ err: error }, "GitHub 원고 목록 조회에 실패해 PostgreSQL 캐시를 사용합니다.");
      return { items: cached.filter((content) => content.state !== "deleted"), freshness: freshness("postgres-cache", true, cached[0]?.updatedAt ?? null) };
    }
  }

  async function persistGitHubDetailSafely(draft: AutomationDraftDetail, operation: string): Promise<boolean> {
    if (!persistGitHubData) return true;
    try {
      await persistGitHubDetailWithRetry(draft);
      return true;
    } catch (error) {
      app.log.warn(
        { err: error, contentId: draft.runId, operation },
        "GitHub 원고 상태는 저장됐지만 PostgreSQL 미러 동기화에 실패했습니다.",
      );
      return false;
    }
  }

  async function deletePersistedContentSafely(contentId: string): Promise<boolean> {
    if (!persistGitHubData) return true;
    try {
      // A missing mirror is already in the desired final state.
      await system.repository.deleteContentPermanently(contentId);
      return true;
    } catch (error) {
      app.log.warn({ err: error, contentId }, "영속 저장소에서 원고와 관련 데이터를 삭제하지 못했습니다.");
      return false;
    }
  }

  function deletedDraftView(draft: AutomationDraftDetail, actorId: string, deletedAt: string): AutomationDraftDetail {
    return {
      ...draft,
      state: {
        ...draft.state,
        deletedAt,
        deletedBy: actorId,
        updatedAt: deletedAt,
        updatedBy: actorId,
      },
    };
  }

  async function getGitHubDetail(id: string, forceRefresh = false) {
    if (persistGitHubData && !forceRefresh) {
      const cached = await system.repository.getContentDetail(id);
      // Image generation runs in a separate GitHub job. While the mirror says
      // queued, reading it as authoritative would hide the ready/failed
      // manifest forever. Probe GitHub until the asynchronous job settles,
      // then the normal Neon fast path resumes.
      const imageStillPending = cached?.content.imageGenerationStatus === "queued";
      if (cached?.versions.length && !imageStillPending) {
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
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
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
    if (error instanceof GitHubAutomationError) {
      const message = error.status === 401 || error.status === 403
        ? "GitHub 자동화 저장소 접근 권한 또는 쓰기 권한이 없습니다. Fine-grained 토큰의 대상 저장소와 Contents → Read and write 권한을 확인해 주세요."
        : error.status === 409 || error.status === 422
          ? "자동화 저장소가 동시에 변경되었습니다. 잠시 후 다시 저장해 주세요."
          : "GitHub 자동화 저장소 업데이트에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      return reply.status(502).send({
        error: {
          code: "GITHUB_AUTOMATION_WRITE_FAILED",
          message,
          details: { githubStatus: error.status },
        },
      });
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
    const runs = await githubAutomation.listWorkflowRuns();
    return { ...(await githubAutomation.capabilities(runs)), runs };
  });
  app.get("/api/automation/runs", async () => ({ items: githubAutomation ? await githubAutomation.listWorkflowRuns() : [] }));
  app.get("/api/automation/history", async () => ({ items: githubAutomation ? await githubAutomation.listAutomationHistory() : [] }));
  app.get("/api/automation/settings", async () => ({
    settings: githubAutomation ? await githubAutomation.getAutomationSettings() : null,
  }));
  app.get("/api/automation/diagnostics", async () => ({
    diagnostics: githubAutomation
      ? await githubAutomation.diagnoseAutomationConnection()
      : {
          status: "attention",
          repository: "",
          branch: "",
          repositoryReadable: false,
          branchReadable: false,
          workflowsReadable: false,
          canWrite: null,
          checkedAt: new Date().toISOString(),
          message: "GitHub 자동화가 연결되지 않았습니다.",
        },
  }));
  app.put("/api/automation/settings", async (request, reply) => {
    if (!githubAutomation) return reply.status(503).send({ error: { code: "AUTOMATION_NOT_CONFIGURED", message: "GitHub 자동화가 연결되지 않았습니다.", details: null } });
    const settings = automationSettingsSchema.parse(request.body) as AutomationSettings;
    return { settings: await githubAutomation.updateAutomationSettings(settings) };
  });
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
  app.post("/api/contents/bulk-delete", async (request) => {
    const { ids } = bulkDeleteSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    const items: Array<ReturnType<typeof draftToContent> & { mirrorSynced?: boolean; deletedFiles?: number }> = [];
    const failures: Array<{ id: string; message: string }> = [];

    // Process in order so GitHub decision-file writes cannot race each other.
    for (const id of [...new Set(ids)]) {
      try {
        if (githubAutomation) {
          const draft = await githubAutomation.getDraft(id);
          const deleted = await githubAutomation.deleteDraftPermanently(id, draft.state);
          const updatedDraft = deletedDraftView(draft, actor.id, deleted.deletedAt);
          const mirrorSynced = await deletePersistedContentSafely(id);
          items.push({ ...draftToContent(updatedDraft), mirrorSynced, deletedFiles: deleted.deletedFiles });
        } else {
          items.push(await system.contentService.delete(id, actor));
        }
      } catch (error) {
        failures.push({ id, message: error instanceof Error ? error.message : "콘텐츠 삭제에 실패했습니다." });
      }
    }
    return { items, failures };
  });
  app.get("/api/contents/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const query = refreshQuerySchema.parse(request.query);
    if (githubAutomation) return getGitHubDetail(id, query.refresh === "true");
    return system.contentService.detail(id);
  });
  app.patch("/api/contents/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = editContentSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      const draft = await githubAutomation.getDraft(id);
      const state = await githubAutomation.editDraft(id, body, actor.id, draft.state);
      const updatedDraft = draftWithState(draft, state);
      const mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "edit");
      return { ...draftToContent(updatedDraft), mirrorSynced };
    }
    return system.contentService.edit(id, body, actor);
  });
  app.delete("/api/contents/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      const draft = await githubAutomation.getDraft(id);
      const deleted = await githubAutomation.deleteDraftPermanently(id, draft.state);
      const updatedDraft = deletedDraftView(draft, actor.id, deleted.deletedAt);
      const mirrorSynced = await deletePersistedContentSafely(id);
      return { ...draftToContent(updatedDraft), mirrorSynced, deletedFiles: deleted.deletedFiles };
    }
    return system.contentService.delete(id, actor);
  });
  app.get("/api/contents/:id/images/:assetId", async (request, reply) => {
    const { id, assetId } = imageParamsSchema.parse(request.params);
    if (!githubAutomation) return reply.status(404).send({ error: { code: "IMAGE_NOT_FOUND", message: "생성된 이미지를 찾을 수 없습니다.", details: null } });
    const query = imagePreviewQuerySchema.parse(request.query);
    const image = await githubAutomation.getDraftImage(id, assetId, { allowFailed: query.preview === "true" });
    return reply
      .header("Content-Type", image.contentType)
      .header("Cache-Control", "private, max-age=300")
      .header("ETag", `"${image.etag}"`)
      .send(image.body);
  });
  app.get("/api/contents/:id/copy-assets", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    // 로컬 목 데이터에는 원격 이미지가 없지만, 본문 서식 복사는 그대로 검증할 수 있어야 한다.
    if (!githubAutomation) {
      const expiresAt = Date.now() + 15 * 60 * 1000;
      return { expiresAt: new Date(expiresAt).toISOString(), items: [] };
    }
    if (!auth) return reply.status(404).send({ error: { code: "IMAGE_NOT_FOUND", message: "복사용 이미지를 찾을 수 없습니다.", details: null } });
    // 실패한 manifest는 진단용 asset 메타데이터만 남기고 실제 파일을 삭제한다.
    // 그런 상태에서 URL을 발급하면 복사 결과에 깨진 이미지가 들어가므로
    // ready manifest의 실제 asset만 서명한다.
    // Failed candidates are retained for authenticated preview, but this
    // endpoint intentionally reads ready-only IDs so copy/public URLs never
    // expose a package that failed visual quality.
    // Use the manifest-only reader in production. Keep a fallback for older
    // adapters so the copy endpoint remains backwards compatible.
    const assetIds = typeof githubAutomation.getDraftImageAssetIds === "function"
      ? await githubAutomation.getDraftImageAssetIds(id)
      : await (async () => {
        const draft = await githubAutomation.getDraft(id);
        return draft.imageManifest?.status === "ready"
          ? (draft.imageManifest.assets ?? []).map((asset) => asset.id)
          : [];
      })();
    if (!assetIds.length) return { expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), items: [] };
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const forwardedProtocol = request.headers["x-forwarded-proto"];
    const protocol = (Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol) ?? request.protocol;
    const host = request.headers.host;
    const items = assetIds.map((assetId) => {
      const resource = `${id}:${assetId}`;
      const signature = auth.signPublicResource(resource, expiresAt);
      return {
        assetId,
        url: `${protocol}://${host}/public/content-images/${encodeURIComponent(id)}/${encodeURIComponent(assetId)}?expires=${expiresAt}&signature=${encodeURIComponent(signature)}`,
      };
    });
    return { expiresAt: new Date(expiresAt).toISOString(), items };
  });
  app.get("/public/content-images/:id/:assetId", async (request, reply) => {
    const { id, assetId } = imageParamsSchema.parse(request.params);
    const { expires, signature } = publicImageQuerySchema.parse(request.query);
    if (!githubAutomation || !auth || !auth.verifyPublicResource(`${id}:${assetId}`, expires, signature)) {
      return reply.status(404).send({ error: { code: "IMAGE_NOT_FOUND", message: "이미지 주소가 만료되었거나 올바르지 않습니다.", details: null } });
    }
    const image = await githubAutomation.getDraftImage(id, assetId);
    return reply
      .header("Content-Type", image.contentType)
      .header("Cache-Control", "public, max-age=900")
      .header("ETag", `"${image.etag}"`)
      .send(image.body);
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
        imageGenerationStatus: "queued",
        imageGenerationWarning: null,
      }, actor.id, draft.state);
      const updatedDraft = draftWithState(draft, state);
      const mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "approve");
      let imagesQueued = false;
      try {
        await githubAutomation.dispatch("images", { run_id: id });
        imagesQueued = true;
      } catch (error) {
        app.log.warn({ err: error, contentId: id }, "Draft was approved, but image generation dispatch failed.");
      }
      return { ...draftToContent(updatedDraft), mirrorSynced, imagesQueued };
    }
    return system.contentService.approve(id, body.checks, actor);
  });
  app.post("/api/contents/:id/images/generate", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!githubAutomation) return reply.status(409).send({ error: { code: "AUTOMATION_UNAVAILABLE", message: "이미지 자동화가 연결되지 않았습니다.", details: null } });
    const draft = await githubAutomation.getDraft(id);
    if (draft.state.deletedAt) {
      return reply.status(409).send({ error: { code: "CONTENT_NOT_APPROVED", message: "승인 완료된 원고만 이미지를 생성할 수 있습니다.", details: null } });
    }
    if (draft.state.rewriteStatus === "queued") {
      return reply.status(409).send({ error: { code: "CONTENT_REWRITE_IN_PROGRESS", message: "A rewrite is already in progress for this draft.", details: null } });
    }
    const body = imageGenerationSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    // Persist the asynchronous state before dispatching. This prevents a
    // stale Neon mirror from masking the GitHub image result on the next poll.
    let state = await githubAutomation.updateState(id, {
      imageGenerationStatus: "queued",
      imageGenerationWarning: null,
    }, actor.id, draft.state);
    let updatedDraft = draftWithState(draft, state);
    let mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "image-generation-queue");
    // Explicit generation and single-asset repairs are allowed before approval.
    // Pass force so the image preflight guard does not block an intentional rerun.
    try {
      await githubAutomation.dispatch("images", {
        run_id: id,
        force: "true",
        ...(body.assetId ? { asset_id: body.assetId } : {}),
        ...(body.feedback ? { feedback: body.feedback } : {}),
      });
    } catch (error) {
      // The request was accepted only after the state write. If dispatch
      // fails, surface a retryable error and leave a truthful failed state.
      try {
        state = await githubAutomation.updateState(id, {
          imageGenerationStatus: "failed",
          imageGenerationWarning: error instanceof Error ? error.message : "이미지 작업을 시작하지 못했습니다.",
        }, actor.id, state);
        updatedDraft = draftWithState(updatedDraft, state);
        mirrorSynced = (await persistGitHubDetailSafely(updatedDraft, "image-generation-dispatch-failed")) && mirrorSynced;
      } catch (stateError) {
        app.log.warn({ err: stateError, contentId: id }, "이미지 작업 실패 상태를 저장하지 못했습니다.");
      }
      return reply.status(502).send({ error: { code: "IMAGE_DISPATCH_FAILED", message: "이미지 작업을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.", details: null } });
    }
    return reply.status(202).send({ accepted: true, content: draftToContent(updatedDraft), mirrorSynced });
  });
  app.post("/api/contents/:id/tone-resume", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    if (!githubAutomation) return reply.status(409).send({ error: { code: "AUTOMATION_UNAVAILABLE", message: "자동화 연결이 설정되지 않았습니다.", details: null } });
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    const draft = await githubAutomation.getDraft(id);
    const toneFailed = draft.toneVerdict === "REWRITE_REQUIRED"
      && draft.toneSkillApplied
      && draftToDetail(draft).qualityResults.some((result) => result.category === "tone" && result.status === "failed");
    if (draft.deleted || draft.publicationStatus !== "none") {
      return reply.status(409).send({ error: { code: "CONTENT_NOT_RESUMABLE", message: "삭제·예약·발행된 원고는 말투 검수를 다시 실행할 수 없습니다.", details: null } });
    }
    if (!toneFailed) {
      return reply.status(409).send({ error: { code: "TONE_RESUME_NOT_AVAILABLE", message: "저장된 말투 검수 실패 원고만 다시 실행할 수 있습니다.", details: null } });
    }
    if (draft.state.rewriteStatus === "queued") {
      return reply.status(409).send({ error: { code: "CONTENT_REWRITE_IN_PROGRESS", message: "이미 말투 검수를 다시 실행하고 있습니다.", details: null } });
    }
    const requestedAt = new Date().toISOString();
    let state = await githubAutomation.updateState(id, {
      reviewStatus: "pending",
      rewriteStatus: "queued",
      rewriteRequestedAt: requestedAt,
      reason: null,
      updatedBy: actor.id,
    }, actor.id, draft.state);
    let updatedDraft = draftWithState(draft, state);
    let mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "tone-resume");
    try {
      // The workflow starts from the saved article and Sol feedback. It does
      // not repeat research, planning, or the full article generation call.
      await githubAutomation.dispatch("rewrite", { run_id: id, mode: "tone_resume" });
      return { ...draftToContent(updatedDraft), mirrorSynced, rewriteQueued: true, recoveryMode: "tone_resume" as const };
    } catch (error) {
      app.log.warn({ err: error, contentId: id }, "저장 원고 말투 재시도 요청을 시작하지 못했습니다.");
      try {
        state = await githubAutomation.updateState(id, { rewriteStatus: "failed" }, actor.id, state);
        updatedDraft = draftWithState(updatedDraft, state);
        mirrorSynced = (await persistGitHubDetailSafely(updatedDraft, "tone-resume-dispatch-failed")) && mirrorSynced;
      } catch (stateError) {
        app.log.warn({ err: stateError, contentId: id }, "말투 재시도 실패 상태를 저장하지 못했습니다.");
      }
      return reply.status(502).send({ error: { code: "TONE_RESUME_DISPATCH_FAILED", message: "저장 원고 재시도를 시작하지 못했습니다. 원고는 그대로 보존되어 있습니다.", details: null } });
    }
  });
  app.post("/api/contents/:id/reject", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = rejectionSchema.parse(request.body);
    const actor = actorFrom(request, auth?.verifyCookie(request.headers.cookie)?.username);
    if (githubAutomation) {
      const draft = await githubAutomation.getDraft(id);
      if (!canRejectGitHubDraft(draft)) {
        return reply.status(409).send({ error: { code: "CONTENT_NOT_REVIEW_READY", message: "검토가 끝난 원고 또는 품질 점검이 완료된 원고만 반려할 수 있습니다.", details: null } });
      }
      const rejectedAt = new Date().toISOString();
      const state = await githubAutomation.updateState(id, {
        reviewStatus: "rejected",
        reason: body.reason,
        approvedBy: null,
        rejectedBy: actor.id,
        rejectedAt,
        approvedAt: null,
        revision: draft.revision ?? draft.state.revision ?? 1,
        rewriteStatus: "queued",
        rewriteRequestedAt: rejectedAt,
      }, actor.id, draft.state);
      let updatedDraft = draftWithState(draft, state);
      let mirrorSynced = await persistGitHubDetailSafely(updatedDraft, "reject");
      let rewriteQueued = false;
      try {
        await githubAutomation.dispatch("rewrite", { run_id: id });
        rewriteQueued = true;
      } catch (error) {
        app.log.warn({ err: error, contentId: id }, "Rejected draft was saved, but rewrite dispatch failed.");
        try {
          const failedState = await githubAutomation.updateState(id, { rewriteStatus: "failed" }, actor.id, updatedDraft.state);
          updatedDraft = draftWithState(updatedDraft, failedState);
          mirrorSynced = (await persistGitHubDetailSafely(updatedDraft, "rewrite-dispatch-failed")) && mirrorSynced;
        } catch (stateError) {
          app.log.warn({ err: stateError, contentId: id }, "Rewrite failure state could not be saved.");
        }
      }
      return { ...draftToContent(updatedDraft), mirrorSynced, rewriteQueued };
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
  function seoulDate(value: string | Date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(typeof value === "string" ? new Date(value) : value);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function trendSnapshotFromCache(cached: Awaited<ReturnType<typeof system.repository.listTrendSignals>>) {
    return {
      collectionDate: seoulDate(cached[0]!.collectedAt),
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
        bestSimilarityRank: null,
        bestRecentRank: null,
        observedDays: 1,
        similarityTopDays: 0,
        bestSearchTrend: null,
        scoreBreakdown: null,
      })),
      unavailableMetrics: { views: "NAVER API HUB 미제공", likes: "NAVER API HUB 미제공", comments: "NAVER API HUB 미제공" },
      searchTrend: { status: "unavailable", reason: "저장된 검색 트렌드 없음" },
    };
  }

  app.get("/api/trends", async (request) => {
    const query = refreshQuerySchema.parse(request.query);
    if (githubAutomation) {
      if (persistGitHubData && query.refresh !== "true") {
        const cached = await system.repository.listTrendSignals();
        // A cache from a previous collection day is useful as a fallback, but
        // it must not mask a newer GitHub snapshot. This was the reason the UI
        // could remain stuck on an old collection date for several days.
        if (cached.length && seoulDate(cached[0]!.collectedAt) === seoulDate()) {
          return trendSnapshotFromCache(cached);
        }
      }
      let trends;
      try {
        trends = await githubAutomation.getTrends(query.refresh === "true");
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
      items: trends.map((trend, index) => ({
        title: trend.title,
        link: trend.url,
        description: `${trend.sourceType}에서 수집한 로컬 검증용 콘텐츠입니다.`,
        bloggername: "로컬 샘플",
        postdate: trend.publishedAt.slice(0, 10),
        candidateScore: Math.round((trend.engagementScore + trend.relevanceScore + trend.trustScore) / 3),
        matchedQueries: [trend.topicKey],
        bestSimilarityRank: index + 1,
        bestRecentRank: index + 1,
        observedDays: Math.min(7, index + 1),
        similarityTopDays: Math.min(7, index + 1),
        bestSearchTrend: {
          query: trend.topicKey,
          category: trend.topicKey,
          baselineAverage: 45,
          recentAverage: 54,
          direction: "rising",
          changePercent: 20,
          momentumScore: 15,
        },
        scoreBreakdown: {
          similarityRank: Math.max(1, 35 - index * 3),
          queryBreadth: 5,
          freshness: 15,
          persistence: Math.min(20, index * 4),
          searchTrend: 15,
          total: trend.relevanceScore,
        },
      })),
      searchTrend: { status: "ok", windowDays: 28, recentDays: 7, baselineDays: 21, requestCount: trends.length },
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
