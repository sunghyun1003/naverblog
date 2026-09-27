import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { writerDirectory, loadDevice, saveDevice, acquireLock } from "./windows.mjs";
import { transferPlan, previewHtml } from "./document.mjs";
import { writeNaverDraft } from "./naver-editor.mjs";

// Intentionally fixed destination; never send the device credential to an URL
// supplied by a job, a redirect, an image manifest or a command-line argument.
const dashboard = "https://carrot-blog.web.app";
const apiPath = "/api/local-writer/worker/";
async function api(endpoint, body = {}, token, binary = false) {
  const response = await fetch(`${dashboard}${apiPath}${endpoint}`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error?.message ?? `대시보드 응답 오류 (${response.status})`);
    error.status = response.status;
    throw error;
  }
  if (!binary) return response.json();
  const type = response.headers.get("content-type")?.split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("이미지 응답 형식이 올바르지 않습니다.");
  const limit = 12 * 1024 * 1024;
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit) throw new Error("이미지 파일이 허용 크기를 넘었습니다.");
    chunks.push(chunk);
  }
  return { type, bytes: Buffer.concat(chunks) };
}
const prompt = async message => {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await input.question(message)).trim(); } finally { input.close(); }
};

async function browser() {
  return chromium.launchPersistentContext(path.join(writerDirectory(), "naver-profile"), {
    channel: "chrome", headless: false, viewport: { width: 1280, height: 900 },
    acceptDownloads: false,
  });
}

async function runJob(context, device, job, isStopping) {
  if (job.blogId !== device.blogId || !/^[a-f0-9]{64}$/.test(job.id) || !/^[a-f0-9]{64}$/.test(job.lease)) throw new Error("대상 블로그 또는 작업 인증이 맞지 않습니다.");
  const directory = path.join(writerDirectory(), "jobs", job.id);
  await mkdir(directory, { recursive: true });
  const journal = path.join(directory, "result.json");
  const previous = await readFile(journal, "utf8").catch(() => null);
  const report = (status, message) => api("report", { jobId: job.id, lease: job.lease, status, message }, device.token);
  // Never replay a locally started job after an uncertain network response.
  if (previous) { await report("needs_check", "이 작업을 이미 PC에서 시작했습니다. 네이버 임시저장 목록을 확인해주세요."); return; }
  await writeFile(journal, JSON.stringify({ startedAt: new Date().toISOString(), status: "started" }));
  let stopped = false;
  let leaseError = null;
  const heartbeat = (async () => {
    while (!stopped) {
      await delay(25_000);
      if (stopped) break;
      try { await report("running", "PC에서 원고 전송을 진행 중입니다. 열린 네이버 편집기를 직접 조작하지 마세요."); }
      catch { leaseError = new Error("PC 연결 확인에 실패했습니다. 중복 작업을 막기 위해 전송을 멈춥니다."); break; }
    }
  })();
  heartbeat.catch(() => {});
  try {
    const plan = transferPlan(job.payload);
    const images = new Map();
    for (const asset of job.payload.assets) {
      const image = await api("asset", { jobId: job.id, lease: job.lease, assetId: asset.id }, device.token, true);
      if (createHash("sha256").update(image.bytes).digest("hex") !== asset.sha256) throw new Error("이미지 파일이 원본과 일치하지 않습니다.");
      images.set(asset.id, image);
      await writeFile(path.join(directory, `${asset.id}.jpg`), image.bytes);
    }
    await writeFile(path.join(directory, "article.json"), JSON.stringify(job.payload, null, 2));
    await writeFile(path.join(directory, "preview.html"), previewHtml(job.payload, plan));
    const preview = await context.newPage();
    await preview.goto(pathToFileURL(path.join(directory, "preview.html")).href);
    await preview.locator("img").evaluateAll(async elements => {
      await Promise.all(elements.map(img => img.decode()));
    });
    const outcome = await writeNaverDraft(context, job, plan, images, async message => {
      if (isStopping()) throw new Error("사용자가 PC 도우미를 종료했습니다. 네이버 임시저장 목록을 확인해주세요.");
      if (leaseError) throw leaseError;
      await report("running", message);
    });
    stopped = true;
    await writeFile(journal, JSON.stringify({ status: "saved", message: outcome, updatedAt: new Date().toISOString() }));
    // Persistence was independently verified. A failed dashboard response must
    // not erase the local proof or cause the already-saved draft to be replayed.
    await report("saved", outcome).catch(() => process.stdout.write("네이버 저장은 확인했지만 대시보드에 결과를 전달하지 못했습니다. 확인 필요로 표시되면 저장된 글을 직접 확인해주세요.\n"));
    process.stdout.write("임시저장 글을 다시 열어 본문과 이미지를 확인했습니다. 발행하지 않았습니다.\n");
  } catch (error) {
    stopped = true;
    // Do not upload stack traces, HTML, screenshot, browser cookies or full URLs.
    const message = error instanceof Error && !/locator|Timeout|waiting|call log/i.test(error.message)
      ? error.message.slice(0, 250) : "네이버 편집기 조작을 확인하지 못해 중단했습니다. 열린 창을 확인해주세요. 원본 미리보기와 이미지는 PC에 보존되어 있습니다.";
    await writeFile(journal, JSON.stringify({ status: "needs_check", message, updatedAt: new Date().toISOString() }));
    await report("needs_check", message).catch(() => {});
    process.stdout.write(`${message}\n`);
  } finally { stopped = true; }
}

async function main() {
  const command = process.argv[2];
  if (!["pair", "login", "start"].includes(command)) throw new Error("명령: pair / login / start");
  const release = await acquireLock();
  let context;
  let exiting = false;
  const stop = () => { exiting = true; };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    if (command === "pair") {
      const code = await prompt("대시보드의 1회용 PC 연결 코드: ");
      if (!/^[a-f0-9]{64}$/.test(code)) throw new Error("연결 코드 형식이 올바르지 않습니다.");
      const device = await api("pair", { code });
      await saveDevice(device);
      process.stdout.write(`PC 연결 완료: ${device.blogId}. 다음: npm run writer:login\n`);
      return;
    }
    // Allow first login before the dashboard release/pairing is available.
    const loginBlog = command === "login" ? process.argv[3] : undefined;
    if (loginBlog && !/^[a-zA-Z0-9_-]{2,50}$/.test(loginBlog)) throw new Error("블로그 ID 형식이 올바르지 않습니다.");
    const device = loginBlog ? { blogId: loginBlog } : await loadDevice();
    if (command === "login") {
      context = await browser();
      const page = await context.newPage();
      await page.goto(`https://blog.naver.com/PostWriteForm.naver?blogId=${encodeURIComponent(device.blogId)}`);
      process.stdout.write(`전용 브라우저에서 직접 로그인하고 대상 블로그(${device.blogId})를 확인하세요. 캡차/추가 인증도 직접 완료해주세요.\n`);
      await prompt("로그인을 마쳤다면 Enter (비밀번호를 여기에 입력하지 마세요): ");
      let editorOpen = false;
      for (const tab of context.pages()) {
        const url = new URL(tab.url());
        if (url.origin === "https://blog.naver.com" && url.searchParams.get("blogId") === device.blogId
          && await tab.locator(".se-documentTitle .se-text-paragraph").isVisible()) editorOpen = true;
      }
      if (!editorOpen) throw new Error("전용 브라우저가 아직 네이버 로그인 화면입니다. 로그인 완료 후 다시 시도해주세요.");
      process.stdout.write("브라우저 로그인 상태를 PC에 보관했습니다. 다음: npm run writer:start\n");
      return;
    }
    process.stdout.write(`PC 도우미 실행 중: ${device.blogId} · 기본 카테고리 · 임시저장만. 종료: Ctrl+C\n`);
    while (!exiting) {
      try {
        const { job } = await api("poll", {}, device.token);
        if (job) {
          if (!context) {
            context = await browser();
            context.on("close", () => { context = undefined; });
          }
          await runJob(context, device, job, () => exiting);
        }
      } catch (error) {
        if (error.status === 401) throw new Error("PC 연결이 해제되었습니다. 다시 연결해주세요.");
        process.stdout.write("대시보드 연결을 확인하고 다시 대기합니다.\n");
      }
      // Short chunks let Ctrl+C stop promptly, even while idle.
      for (let i = 0; i < 15 && !exiting; i++) await delay(1000);
    }
  } finally {
    await context?.close().catch(() => {});
    await release();
  }
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
