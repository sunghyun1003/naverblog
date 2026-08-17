import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { isDomainError } from "../domain/errors.js";
import { userRoles, type Actor, type UserRole } from "../domain/types.js";
import { randomId } from "../domain/utils.js";
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
const idParamsSchema = z.object({ id: z.string().min(1) });

export interface AppOptions {
  system?: AutomationSystem;
  webOrigin?: string;
  logger?: boolean;
  databaseProvider?: "memory" | "postgres";
}

function parseRoles(value: string | string[] | undefined): UserRole[] {
  const values = (Array.isArray(value) ? value.join(",") : value ?? "admin")
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is UserRole => userRoles.includes(role as UserRole));
  return values.length > 0 ? values : ["admin"];
}

function actorFrom(request: FastifyRequest): Actor {
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

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Headers", "Content-Type, X-User-Id, X-User-Roles, X-Idempotency-Key");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") return reply.status(204).send();
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

  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString(), adapters: "mock", database: databaseProvider }));
  app.get("/api/system/capabilities", async () => ({
    mode: "local-mock",
    integrations: {
      ai: { configured: false, provider: "mock" },
      naverSearch: { configured: false, provider: "mock" },
      youtube: { configured: false, provider: "mock" },
      slack: { configured: false, provider: "mock" },
      publisher: { configured: false, provider: "mock" },
      database: { configured: databaseProvider === "postgres", provider: databaseProvider },
    },
  }));

  app.get("/api/contents", async () => ({ items: await system.contentService.list() }));
  app.post("/api/contents", async (request, reply) => {
    const body = createContentSchema.parse(request.body);
    const content = await system.contentService.create(
      { ...body, assigneeId: body.assigneeId ?? null, idempotencyKey: idempotencyKey(request, "content") },
      actorFrom(request),
    );
    return reply.status(201).send(content);
  });
  app.get("/api/contents/:id", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return system.contentService.detail(id);
  });
  app.post("/api/contents/:id/pipeline", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const job = await system.contentService.runPipeline(id, idempotencyKey(request, `pipeline:${id}`), actorFrom(request));
    return reply.status(202).send(job);
  });
  app.post("/api/contents/:id/approve", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = approvalSchema.parse(request.body);
    return system.contentService.approve(id, body.checks, actorFrom(request));
  });
  app.post("/api/contents/:id/reject", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = rejectionSchema.parse(request.body);
    return system.contentService.reject(id, body.reason, actorFrom(request));
  });
  app.post("/api/contents/:id/schedule", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = scheduleSchema.parse(request.body);
    return system.contentService.schedule(id, body.scheduledAt, actorFrom(request));
  });
  app.post("/api/contents/:id/publish", async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return system.contentService.publish(id, actorFrom(request));
  });
  app.get("/api/trends", async () => ({ items: await system.repository.listTrendSignals() }));

  return app;
}
