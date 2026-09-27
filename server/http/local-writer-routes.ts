import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { DomainError } from "../domain/errors.js";
import type { ContentDetail } from "../domain/types.js";
import { LocalWriter } from "../services/local-writer.js";
import { naverTransfer } from "../services/naver-transfer.js";

const codeSchema = z.string().regex(/^[a-f0-9]{64}$/);
const jobSchema = z.object({ jobId: codeSchema });
const blogSchema = z.string().trim().transform(value => value.replace(/^https:\/\/blog\.naver\.com\//, "").replace(/\/$/, ""))
  .pipe(z.string().regex(/^[a-zA-Z0-9_-]{2,50}$/, "블로그 주소 또는 블로그 ID를 입력해주세요."));
function token(request: FastifyRequest): string {
  const value = request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!value) throw new DomainError("WRITER_UNAUTHORIZED", "PC 연결 인증이 필요합니다.", 401);
  return value;
}
// Exact allowlist only. These endpoints apply their own scoped device auth;
// a device token must never become a dashboard login or GitHub credential.
export function isLocalWriterWorkerRequest(method: string, url: string): boolean {
  return method === "POST" && /^\/api\/local-writer\/worker\/(pair|poll|report|asset)$/.test(url);
}

export function registerLocalWriterRoutes(app: FastifyInstance, options: {
  writer: LocalWriter;
  detail: (id: string) => Promise<ContentDetail>;
  image: (contentId: string, assetId: string) => Promise<{ body: Buffer; contentType: string }>;
}) {
  const { writer } = options;
  app.get("/api/local-writer", async request => {
    const query = z.object({ contentId: z.string().max(100).optional() }).parse(request.query);
    return writer.status(query.contentId);
  });
  app.post("/api/local-writer/pairing", async request => {
    const body = z.object({ blogId: blogSchema }).parse(request.body);
    return writer.createPairing(body.blogId);
  });
  app.post("/api/local-writer/revoke", () => writer.revoke());
  app.post("/api/contents/:id/naver-draft", async request => {
    const { id } = z.object({ id: z.string().min(1).max(100) }).parse(request.params);
    const { versionId } = z.object({ versionId: z.string().min(1).max(200) }).parse(request.body);
    // Do not make an expensive GitHub call when the PC isn't even available.
    if (!(await writer.status()).online) throw new DomainError("WRITER_OFFLINE", "Windows PC에서 도우미를 실행해주세요.", 409);
    const payload = naverTransfer(await options.detail(id));
    if (payload.versionId !== versionId) throw new DomainError("DRAFT_CHANGED", "원고가 변경되었습니다. 새로고침한 뒤 다시 보내주세요.", 409);
    return writer.enqueue(payload);
  });
  app.post("/api/local-writer/resolve", async request => {
    const { jobId, saved } = jobSchema.extend({ saved: z.boolean() }).parse(request.body);
    return writer.resolve(jobId, saved);
  });
  app.post("/api/local-writer/worker/pair", async request => {
    const { code } = z.object({ code: codeSchema }).parse(request.body);
    return writer.pair(code);
  });
  app.post("/api/local-writer/worker/poll", request => writer.poll(token(request)));
  app.post("/api/local-writer/worker/report", async request => {
    const body = jobSchema.extend({ lease: codeSchema, status: z.enum(["running", "needs_check", "saved"]), message: z.string().trim().min(1).max(400) }).parse(request.body);
    return writer.report(token(request), body.jobId, body.lease, body.status, body.message);
  });
  app.post("/api/local-writer/worker/asset", async (request, reply) => {
    const body = jobSchema.extend({ lease: codeSchema, assetId: z.string().regex(/^[a-z0-9-]+$/) }).parse(request.body);
    const { contentId, asset } = await writer.asset(token(request), body.jobId, body.lease, body.assetId);
    const image = await options.image(contentId, asset.id);
    if (createHash("sha256").update(image.body).digest("hex") !== asset.sha256) {
      throw new DomainError("IMAGE_CHANGED", "전송 요청 이후 이미지가 변경되었습니다. 원고를 새로고침해주세요.", 409);
    }
    return reply.type(image.contentType).send(image.body);
  });
}
