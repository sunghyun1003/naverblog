import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { writerDirectory, loadDevice, saveDevice, acquireLock, checkDeviceStorage } from "./windows.mjs";
import { transferPlan, previewHtml } from "./document.mjs";
import { writeNaverDraft } from "./naver-editor.mjs";
import { confirmNaverLogin, closeEmptyLoginEditor } from "./login.mjs";
import { desktopCommands } from "./desktop-input.mjs";
import { validateTarget, writeUrl, sameTarget, profileParts, categoryDescription } from "./target.mjs";

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

async function browser(device) {
  return chromium.launchPersistentContext(path.join(writerDirectory(), ...profileParts(device)), {
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
  let stage = "원고와 이미지 파일 준비";
  const progress = async message => {
    stage = message;
    process.stdout.write(`${message}\n`);
    await writeFile(journal, JSON.stringify({ status: "started", stage, updatedAt: new Date().toISOString() }));
    await report("running", message);
  };
  const heartbeat = (async () => {
    while (!stopped) {
      await delay(25_000);
      if (stopped) break;
      try { await report("running", stage); }
      catch { leaseError = new Error("PC 연결 확인에 실패했습니다. 중복 작업을 막기 위해 전송을 멈춥니다."); break; }
    }
  })();
  heartbeat.catch(() => {});
  try {
    if (!sameTarget(device, job)) throw new Error("PC에 연결한 블로그·카테고리와 전송 대상이 다릅니다. 다시 연결해주세요.");
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
    await progress("네이버 편집기를 열고 입력 가능한 상태인지 확인하고 있습니다.");
    const outcome = await writeNaverDraft(context, job, plan, images, async message => {
      if (isStopping()) throw new Error("사용자가 PC 도우미를 종료했습니다. 네이버 임시저장 목록을 확인해주세요.");
      if (leaseError) throw leaseError;
      await progress(message);
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
      ? error.message.slice(0, 250) : `중단 단계: ${stage} 편집기 응답을 확인하지 못했습니다. 저장 완료가 아니며 입력 내용은 열린 창에 보존했습니다.`;
    await writeFile(journal, JSON.stringify({ status: "needs_check", stage, errorType: error?.name === "TimeoutError" ? "timeout" : "operation_failed", message, updatedAt: new Date().toISOString() }));
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
  let desktopInput;
  const stop = () => { exiting = true; };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    if (command === "pair") {
      await checkDeviceStorage();
      const code = await prompt("대시보드의 1회용 PC 연결 코드: ");
      if (!/^[a-f0-9]{64}$/.test(code)) throw new Error("연결 코드 형식이 올바르지 않습니다.");
      const device = await api("pair", { code });
      validateTarget(device);
      await saveDevice(device);
      process.stdout.write(`PC 연결 완료: ${device.blogId} · ${categoryDescription(device)}. 다음: npm run writer:login\n`);
      return;
    }
    // Allow first login before the dashboard release/pairing is available.
    const loginBlog = command === "login" ? process.argv[3] : undefined;
    const loginCategoryId = command === "login" ? process.argv[4] : undefined;
    const loginCategoryName = command === "login" ? process.argv[5] : undefined;
    if (Boolean(loginCategoryId) !== Boolean(loginCategoryName)) throw new Error("카테고리 번호와 이름을 함께 입력해주세요.");
    const device = validateTarget(loginBlog ? { blogId: loginBlog, profileVersion: 2,
      ...(loginCategoryId ? { category: { id: loginCategoryId, name: loginCategoryName } } : {}) } : await loadDevice());
    if (process.env.WRITER_DESKTOP === "1") desktopInput = desktopCommands(process.stdin, stop);
    if (command === "login") {
      context = await browser(device);
      context.on("close", () => { context = undefined; desktopInput?.close(); stop(); });
      const page = await context.newPage();
      await page.goto(writeUrl(device));
      process.stdout.write(`전용 브라우저에서 직접 로그인하고 대상 블로그(${device.blogId})를 확인하세요. 캡차/추가 인증도 직접 완료해주세요.\n`);
      while (true) {
        if (process.env.WRITER_DESKTOP === "1") process.stdout.write("WRITER_LOGIN_WAITING\n");
        const answer = desktopInput ? await desktopInput.next()
          : await prompt("로그인을 마쳤다면 Enter (비밀번호를 여기에 입력하지 마세요): ");
        if (answer === "stop") return;
        try {
          const editor = await confirmNaverLogin(context, device);
          if (exiting) return;
          if (process.env.WRITER_DESKTOP !== "1") {
            process.stdout.write("로그인 확인 완료. 브라우저 종료 시 네이버가 다시 로그인을 요구할 수 있습니다. PC 도우미 창에서는 로그인한 브라우저를 유지합니다.\n");
            return;
          }
          const cleared = await closeEmptyLoginEditor(editor, context);
          if (!cleared) process.stdout.write("열린 글쓰기 탭에 내용 또는 복구 안내가 있을 수 있어 그대로 두었습니다. 기존 글을 확인하고 해당 탭을 닫은 뒤 원고를 보내주세요.\n");
          process.stdout.write("로그인 확인 완료. 로그인한 브라우저를 유지하고 대시보드 연결을 시작합니다.\nWRITER_LOGIN_READY\n");
          break;
        } catch (error) {
          if (exiting) return;
          if (process.env.WRITER_DESKTOP !== "1" || !context?.pages().length) throw error;
          process.stdout.write(`${error.message}\n창을 닫지 않았습니다. 전용 Chrome을 확인한 뒤 로그인 완료를 다시 누르거나 실행 중지를 눌러주세요.\n`);
        }
      }
    }
    process.stdout.write(`대시보드 연결 확인 중: ${device.blogId} · ${categoryDescription(device)} · 임시저장만.\n`);
    let connected = false;
    while (!exiting) {
      try {
        const { job } = await api("poll", { protocolVersion: 2 }, device.token);
        if (!connected) process.stdout.write("대시보드 연결 확인 완료. PC 도우미 실행 중입니다.\n");
        connected = true;
        if (job) {
          if (!context) {
            context = await browser(device);
            context.on("close", () => { context = undefined; });
          }
          await runJob(context, device, job, () => exiting);
        }
      } catch (error) {
        connected = false;
        if (error.status === 401) throw new Error("PC 연결이 해제되었습니다. 다시 연결해주세요.");
        process.stdout.write(`대시보드 연결 실패${Number.isInteger(error.status) ? ` (HTTP ${error.status})` : " (네트워크 또는 응답 확인 오류)"}. 잠시 후 다시 확인합니다.\n`);
      }
      // Short chunks let Ctrl+C stop promptly, even while idle.
      for (let i = 0; i < 15 && !exiting; i++) await delay(1000);
    }
  } finally {
    desktopInput?.close();
    await context?.close().catch(() => {});
    await release();
  }
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
