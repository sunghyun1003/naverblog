import assert from "node:assert/strict";
import test from "node:test";
import { LocalWriter } from "../server/services/local-writer.js";
import { naverTransfer } from "../server/services/naver-transfer.js";
import { InMemoryAutomationRepository } from "../server/repositories/in-memory.js";
import { buildApp } from "../server/http/app.js";
import { SessionAuthService } from "../server/services/session-auth.js";
import type { ContentDetail } from "../server/domain/types.js";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import type { Pool } from "pg";
import { PostgresAutomationRepository } from "../server/repositories/postgres.js";
import { registerLocalWriterRoutes } from "../server/http/local-writer-routes.js";
import { DomainError } from "../server/domain/errors.js";

const example = () => ({
  content: { id: "123", state: "approved" },
  versions: [{ id: "v2", title: "최신 수동 수정 원고", body: "# 최신 수동 수정 원고\n\n## 3줄 요약\n\n- 첫째\n- 둘째\n- 셋째\n\n## 본문\n\n보장 범위를 확인해요.\n\n## FAQ\n\n궁금한 점은?\n\n## 출처\n\nhttps://example.com\n\n개별 약관을 확인해주세요.",
    metadata: { imagePackage: { status: "ready", technicalQualityPassed: true, visualQualityPassed: true, assets: [
      { id: "hero", role: "hero", afterSection: 0, altText: "대표", sha256: "a".repeat(64) },
      { id: "visual-01", role: "inline", afterSection: 2, altText: "본문", sha256: "b".repeat(64) },
    ] } } }],
} as unknown as ContentDetail);

async function fixture() {
  let now = 2_000_000;
  const repo = new InMemoryAutomationRepository();
  const writer = new LocalWriter(repo, () => now);
  const code = await writer.createPairing("my_blog");
  const device = await writer.pair(code.code);
  await writer.poll(device.token);
  return { repo, writer, device, advance: (ms: number) => { now += ms; } };
}

test("전송 원고는 최신 본문·수동 적용 이미지·요약·FAQ를 보존한다", () => {
  const detail = example();
  const transfer = naverTransfer(detail);
  assert.equal(transfer.body, detail.versions[0]!.body);
  assert.equal(transfer.title, "최신 수동 수정 원고");
  assert.equal(transfer.assets.length, 2);
  detail.versions[0]!.metadata.imagePackage = { ...(detail.versions[0]!.metadata.imagePackage as object), status: "failed", visualQualityPassed: false, appliedAssetIds: ["hero"] };
  assert.deepEqual(naverTransfer(detail).assets.map(a => a.id), ["hero"]);
  assert.notEqual(naverTransfer(detail).fingerprint, transfer.fingerprint);
});
test("미완성 원고와 이미지 처리 중에는 전송하지 않는다", () => {
  const detail = example(); detail.content.state = "drafting";
  assert.throws(() => naverTransfer(detail), /완성된/);
  detail.content.state = "approved"; detail.content.imageGenerationStatus = "queued";
  assert.throws(() => naverTransfer(detail), /완성된/);
});
test("연결 코드는 1회용이고 기한이 지나면 거부한다", async () => {
  const { writer, advance } = await fixture();
  const pairing = await writer.createPairing("my_blog");
  await writer.pair(pairing.code);
  await assert.rejects(() => writer.pair(pairing.code), /연결 코드/);
  const expired = await writer.createPairing("my_blog"); advance(600_001);
  await assert.rejects(() => writer.pair(expired.code), /연결 코드/);
});
test("서버에는 평문 PC 토큰을 남기지 않고 화면 응답에서도 제외한다", async () => {
  const { repo, writer, device } = await fixture();
  assert.ok(!JSON.stringify(await repo.getLocalWriterState()).includes(device.token));
  assert.ok(!JSON.stringify(await writer.status()).includes("tokenHash"));
  await assert.rejects(() => writer.poll("f".repeat(64)), /연결을 다시/);
});
test("PC 꺼짐은 전송 거부, 받지 않은 작업은 다음 부팅 때 실행하지 않는다", async () => {
  const { writer, device, advance } = await fixture();
  const job = await writer.enqueue(naverTransfer(example()));
  advance(90_001);
  await assert.rejects(() => writer.enqueue(naverTransfer(example())), /도우미/);
  assert.equal((await writer.poll(device.token)).job, null);
  assert.equal((await writer.status()).jobs.find(j => j.id === job.id)?.status, "cancelled");
});
test("동시 클릭과 동시 PC 폴링에도 작업은 한 번만 할당된다", async () => {
  const { writer, device } = await fixture();
  const payload = naverTransfer(example());
  const jobs = await Promise.all([writer.enqueue(payload), writer.enqueue(payload)]);
  assert.equal(jobs[0]!.id, jobs[1]!.id);
  const claims = await Promise.all([writer.poll(device.token), writer.poll(device.token)]);
  assert.equal(claims.filter(c => c.job).length, 1);
});
test("PC 중단 이후 자동 재전송하지 않고 수동 확인을 기다린다", async () => {
  const { writer, device, advance } = await fixture();
  await writer.enqueue(naverTransfer(example()));
  const claim = (await writer.poll(device.token)).job!;
  advance(120_001);
  assert.equal((await writer.poll(device.token)).job, null);
  assert.equal((await writer.status()).jobs[0]?.status, "needs_check");
  await assert.rejects(() => writer.report(device.token, claim.id, claim.lease, "running", "old"), /만료/);
  await writer.resolve(claim.id, false);
  assert.notEqual((await writer.enqueue(naverTransfer(example()))).id, claim.id);
});
test("작업에 없는 이미지와 다른 작업의 lease 접근을 거부한다", async () => {
  const { writer, device } = await fixture();
  await writer.enqueue(naverTransfer(example()));
  const job = (await writer.poll(device.token)).job!;
  assert.equal((await writer.asset(device.token, job.id, job.lease, "hero")).contentId, "123");
  await assert.rejects(() => writer.asset(device.token, job.id, job.lease, "unknown"), /포함되지/);
  await assert.rejects(() => writer.asset(device.token, job.id, "f".repeat(64), "hero"), /만료/);
});
test("저장 버튼 클릭은 완료로 승격하지 않고, 확인 후에도 발행 상태는 바꾸지 않는다", async () => {
  const { writer, device } = await fixture();
  const payload = naverTransfer(example());
  await writer.enqueue(payload);
  const job = (await writer.poll(device.token)).job!;
  await writer.report(device.token, job.id, job.lease, "needs_check", "저장 목록 확인 필요");
  assert.equal((await writer.enqueue(payload)).status, "needs_check");
  await writer.resolve(job.id, true);
  assert.equal((await writer.enqueue(payload)).status, "saved");
});
test("진행 중 장치 교체와 연결 해제 이후 old 토큰을 차단한다", async () => {
  const { writer, device } = await fixture();
  const pairing = await writer.createPairing("other_blog");
  await writer.enqueue(naverTransfer(example()));
  await assert.rejects(() => writer.pair(pairing.code), /진행 중/);
  await writer.revoke();
  await assert.rejects(() => writer.poll(device.token), /연결을 다시/);
});
test("재열기 검증 완료 보고는 원고를 중복 전송하지 않고 작업 본문과 lease를 지운다", async () => {
  const { repo, writer, device } = await fixture();
  const payload = naverTransfer(example());
  await writer.enqueue(payload);
  const job = (await writer.poll(device.token)).job!;
  await writer.report(device.token, job.id, job.lease, "saved", "저장 글을 다시 열어 확인했습니다.");
  assert.equal((await writer.enqueue(payload)).status, "saved");
  assert.equal((await writer.status()).blockingJob, null);
  assert.equal((await writer.poll(device.token)).job, null);
  const stored = JSON.stringify(await repo.getLocalWriterState());
  assert.ok(!stored.includes('"payload"'));
  assert.ok(!stored.includes('"leaseHash"'));
  await assert.rejects(() => writer.report(device.token, job.id, job.lease, "running", "late heartbeat"), /만료/);
});
test("worker 토큰으로 대시보드 API를 열 수 없고 연결 API도 로그인/CSRF 검사를 유지한다", async () => {
  const auth = new SessionAuthService({ username: "tester", password: "test-password", sessionSecret: "test-secret-only", secureCookie: false });
  const app = buildApp({ auth });
  try {
    assert.equal((await app.inject({ method: "POST", url: "/api/local-writer/pairing", payload: { blogId: "mine" } })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: "/api/local-writer", headers: { authorization: `Bearer ${"a".repeat(64)}` } })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/local-writer/worker/poll" })).statusCode, 401);
    const session = auth.sessionCookie({ username: "tester", expiresAt: Date.now() + 100000 });
    assert.equal((await app.inject({ method: "POST", url: "/api/local-writer/pairing", headers: { cookie: session }, payload: { blogId: "mine" } })).statusCode, 403);
    const invalid = await app.inject({ method: "POST", url: "/api/local-writer/pairing", headers: { cookie: session, "x-requested-with": "dashboard" }, payload: { blogId: "https://blog.naver.com.evil.example/mine" } });
    assert.equal(invalid.statusCode, 400);
  } finally { await app.close(); }
});
test("HTTP 연결→요청→수신→이미지 검증→저장 보고가 원고 버전을 그대로 유지한다", async () => {
  const repo = new InMemoryAutomationRepository();
  const writer = new LocalWriter(repo);
  const detail = example();
  const bytes = Buffer.from("fixture-image-only");
  const digest = createHash("sha256").update(bytes).digest("hex");
  (detail.versions[0]!.metadata.imagePackage as { assets: Array<{ sha256: string }> }).assets.forEach(a => { a.sha256 = digest; });
  let imageReads = 0;
  let changed = false;
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => reply.status(error instanceof DomainError ? error.statusCode : 500).send({ message: error instanceof Error ? error.message : "error" }));
  registerLocalWriterRoutes(app, { writer, detail: async () => detail, image: async () => { imageReads++; return { body: changed ? Buffer.from("changed") : bytes, contentType: "image/jpeg" }; } });
  const post = (url: string, payload: unknown = {}, token?: string) => app.inject({ method: "POST", url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  try {
    const pairing = await post("/api/local-writer/pairing", { blogId: "https://blog.naver.com/my_blog" });
    const device = (await post("/api/local-writer/worker/pair", { code: pairing.json().code })).json();
    await post("/api/local-writer/worker/poll", {}, device.token);
    assert.equal((await post("/api/contents/123/naver-draft", { versionId: "stale" })).statusCode, 409);
    const queued = await post("/api/contents/123/naver-draft", { versionId: "v2" });
    assert.equal(queued.statusCode, 200);
    const job = (await post("/api/local-writer/worker/poll", {}, device.token)).json().job;
    assert.equal(job.payload.body, detail.versions[0]!.body);
    assert.equal(job.payload.fingerprint, naverTransfer(detail).fingerprint);
    const input = { jobId: job.id, lease: job.lease, assetId: "hero" };
    assert.equal((await post("/api/local-writer/worker/asset", { ...input, assetId: "not-selected" }, device.token)).statusCode, 404);
    assert.equal(imageReads, 0);
    assert.equal((await post("/api/local-writer/worker/asset", input, device.token)).body, bytes.toString());
    changed = true;
    assert.equal((await post("/api/local-writer/worker/asset", input, device.token)).statusCode, 409);
    const completed = await post("/api/local-writer/worker/report", { jobId: job.id, lease: job.lease, status: "saved", message: "재열기 검증 완료" }, device.token);
    assert.equal(completed.json().status, "saved");
    assert.equal((await post("/api/contents/123/naver-draft", { versionId: "v2" })).json().id, job.id);
    assert.equal(detail.content.state, "approved");
  } finally { await app.close(); }
});
test("Postgres 작업 할당은 팀과 이전 revision 모두가 일치해야 성공한다", async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  let rowCount = 1;
  const pool = { query: async (sql: string, args: unknown[]) => { calls.push({ sql, args }); return { rows: [], rowCount }; } } as unknown as Pool;
  const repo = new PostgresAutomationRepository("carrot-company", pool);
  assert.equal(await repo.getLocalWriterState(), null);
  assert.deepEqual(calls[0]!.args, ["carrot-company"]);
  assert.equal(await repo.compareLocalWriterState(0, { jobs: [] }), true);
  assert.match(calls[1]!.sql, /ON CONFLICT DO NOTHING/);
  rowCount = 0;
  assert.equal(await repo.compareLocalWriterState(7, { jobs: [] }), false);
  assert.match(calls[2]!.sql, /WHERE team_id=\$1 AND revision=\$2/);
  assert.deepEqual(calls[2]!.args.slice(0, 2), ["carrot-company", 7]);
});
