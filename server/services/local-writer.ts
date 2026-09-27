import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DomainError } from "../domain/errors.js";
import type { AutomationRepository } from "../repositories/contracts.js";
import type { NaverTransfer } from "./naver-transfer.js";

export type WriterStatus = "queued" | "running" | "needs_check" | "saved" | "cancelled";
interface WriterJob {
  id: string; contentId: string; title: string; fingerprint: string;
  blogId: string; status: WriterStatus; updatedAt: number;
  message: string; leaseHash?: string; payload?: NaverTransfer;
}
interface WriterState {
  pairing?: { hash: string; expiresAt: number; blogId: string };
  device?: { tokenHash: string; blogId: string; lastSeen: number };
  jobs: WriterJob[];
  // Only compact receipts survive history pruning; sending an unchanged article
  // twice never creates another Naver draft, even after many later jobs.
  receipts: Record<string, string>;
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const equal = (value: string, expected: string) => timingSafeEqual(Buffer.from(hash(value), "hex"), Buffer.from(expected, "hex"));
const secret = () => randomBytes(32).toString("hex");
const fail = (code: string, message: string, status = 409): never => { throw new DomainError(code, message, status); };
const onlineMs = 90_000;
const leaseMs = 120_000;
export const publicWriterJob = (job: WriterJob) => ({
  id: job.id, contentId: job.contentId, title: job.title, blogId: job.blogId,
  status: job.status, updatedAt: job.updatedAt, message: job.message,
});

export class LocalWriter {
  constructor(private readonly repository: AutomationRepository, private readonly now = () => Date.now()) {}

  private async change<T>(mutate: (state: WriterState) => T): Promise<T> {
    for (let i = 0; i < 8; i++) {
      const record = await this.repository.getLocalWriterState<WriterState>();
      const state = record?.value ?? { jobs: [], receipts: {} };
      for (const job of state.jobs) {
        if (job.status === "running" && this.now() - job.updatedAt > leaseMs) {
          job.status = "needs_check";
          job.message = "PC 연결이 끊겼습니다. 네이버 임시저장 목록을 확인하기 전에는 다시 보내지 않습니다.";
          delete job.leaseHash;
        }
        if (job.status === "queued" && this.now() - job.updatedAt > onlineMs) {
          job.status = "cancelled";
          job.message = "PC가 작업을 받지 않아 취소했습니다. PC 도우미를 켠 뒤 다시 보내주세요.";
          delete state.receipts[job.fingerprint];
          delete job.payload;
        }
      }
      const result = mutate(state);
      if (await this.repository.compareLocalWriterState(record?.revision ?? 0, state)) return result;
    }
    return fail("WRITER_BUSY", "다른 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.");
  }

  private device(state: WriterState, token: string) {
    if (!state.device || !equal(token, state.device.tokenHash)) return fail("WRITER_UNAUTHORIZED", "PC 연결을 다시 설정해주세요.", 401);
    return state.device;
  }

  async status(contentId?: string) {
    return this.change(state => ({
      connected: Boolean(state.device), online: Boolean(state.device && this.now() - state.device.lastSeen < onlineMs),
      blogId: state.device?.blogId ?? null,
      jobs: state.jobs.filter(job => !contentId || job.contentId === contentId).map(publicWriterJob),
      blockingJob: state.jobs.filter(job => ["queued", "running", "needs_check"].includes(job.status)).map(publicWriterJob)[0] ?? null,
    }));
  }

  async createPairing(blogId: string) {
    const code = secret();
    return this.change(state => {
      if (state.jobs.some(j => ["running", "queued", "needs_check"].includes(j.status))) return fail("WRITER_ACTIVE", "진행 중인 작업을 먼저 확인해주세요.");
      state.pairing = { hash: hash(code), expiresAt: this.now() + 600_000, blogId };
      return { code, expiresAt: state.pairing.expiresAt };
    });
  }

  async pair(code: string) {
    const token = secret();
    return this.change(state => {
      if (!state.pairing || state.pairing.expiresAt < this.now() || !equal(code, state.pairing.hash)) return fail("PAIRING_INVALID", "연결 코드가 만료되었거나 올바르지 않습니다.", 401);
      if (state.jobs.some(j => ["running", "queued", "needs_check"].includes(j.status))) return fail("WRITER_ACTIVE", "진행 중인 작업을 먼저 확인해주세요.");
      const blogId = state.pairing.blogId;
      state.device = { tokenHash: hash(token), blogId, lastSeen: 0 };
      delete state.pairing;
      return { token, blogId };
    });
  }

  async enqueue(payload: NaverTransfer) {
    return this.change(state => {
      if (!state.device || this.now() - state.device.lastSeen >= onlineMs) return fail("WRITER_OFFLINE", "Windows PC에서 도우미를 실행한 뒤 다시 눌러주세요.");
      const fingerprint = hash(`${state.device.blogId}:${payload.fingerprint}`);
      const previous = state.receipts[fingerprint];
      if (previous) {
        const job = state.jobs.find(j => j.id === previous);
        if (job) return publicWriterJob(job);
        return fail("ALREADY_SENT", "동일한 원고를 이미 보냈습니다. 네이버 임시저장 목록을 확인해주세요.");
      }
      if (state.jobs.some(j => ["queued", "running", "needs_check"].includes(j.status))) return fail("WRITER_ACTIVE", "이전 임시저장 작업을 먼저 확인해주세요.");
      const job: WriterJob = { id: secret(), contentId: payload.contentId, title: payload.title, fingerprint,
        blogId: state.device.blogId, status: "queued", updatedAt: this.now(), message: "PC에서 작업을 받는 중입니다.", payload };
      state.jobs = [...state.jobs.slice(-19), job];
      state.receipts[fingerprint] = job.id;
      return publicWriterJob(job);
    });
  }

  async poll(token: string) {
    const lease = secret();
    return this.change(state => {
      this.device(state, token).lastSeen = this.now();
      // Interrupted external actions must NEVER be automatically replayed.
      if (state.jobs.some(j => ["running", "needs_check"].includes(j.status))) return { job: null };
      const job = state.jobs.find(j => j.status === "queued");
      if (!job) return { job: null };
      job.status = "running"; job.updatedAt = this.now(); job.leaseHash = hash(lease);
      job.message = "Windows PC에서 네이버 임시저장을 준비하고 있습니다.";
      return { job: { ...publicWriterJob(job), payload: job.payload!, lease } };
    });
  }

  async asset(token: string, jobId: string, lease: string, assetId: string) {
    return this.change(state => {
      this.device(state, token);
      const job = state.jobs.find(j => j.id === jobId);
      if (!job || job.status !== "running" || !job.leaseHash || !equal(lease, job.leaseHash)) return fail("WRITER_LEASE_INVALID", "작업 연결이 만료되었습니다.", 403);
      const asset = job.payload?.assets.find(a => a.id === assetId);
      if (!asset) return fail("WRITER_ASSET_INVALID", "이 작업에 포함되지 않은 이미지입니다.", 404);
      return { contentId: job.contentId, asset };
    });
  }

  async report(token: string, jobId: string, lease: string, status: "running" | "needs_check" | "saved", message: string) {
    return this.change(state => {
      this.device(state, token).lastSeen = this.now();
      const job = state.jobs.find(j => j.id === jobId);
      if (!job || job.status !== "running" || !job.leaseHash || !equal(lease, job.leaseHash)) return fail("WRITER_LEASE_INVALID", "작업 연결이 만료되었습니다.", 403);
      job.status = status; job.updatedAt = this.now(); job.message = message;
      if (status !== "running") delete job.leaseHash;
      if (status === "saved") delete job.payload;
      return publicWriterJob(job);
    });
  }

  // Manual recovery is only for uncertain outcomes. The worker reports saved
  // only after reopening the saved draft and comparing its body and images.
  async resolve(jobId: string, saved: boolean) {
    return this.change(state => {
      const job = state.jobs.find(j => j.id === jobId);
      if (!job || job.status !== "needs_check") return fail("WRITER_NOT_CHECKABLE", "확인할 작업이 없습니다.");
      job.status = saved ? "saved" : "cancelled";
      job.message = saved ? "네이버 임시저장 목록에서 사용자가 확인했습니다. 발행한 상태는 아닙니다." : "사용자가 네이버에 저장되지 않았음을 확인했습니다. 다시 보낼 수 있습니다.";
      job.updatedAt = this.now();
      if (!saved) delete state.receipts[job.fingerprint];
      delete job.payload;
      return publicWriterJob(job);
    });
  }

  async revoke() {
    return this.change(state => {
      delete state.device; delete state.pairing;
      for (const job of state.jobs) {
        if (job.status === "running") { job.status = "needs_check"; job.message = "PC 연결을 해제했습니다. 네이버 저장 여부를 직접 확인해주세요."; delete job.leaseHash; }
        if (job.status === "queued") { job.status = "cancelled"; delete job.payload; delete state.receipts[job.fingerprint]; }
      }
      return { revoked: true };
    });
  }
}
