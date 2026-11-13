import { setTimeout as delay } from "node:timers/promises";
import { editorBlogId, validateTarget, writeUrl } from "./target.mjs";

// Login is confirmed by the target editor, not by cookies or a login-button
// click. The editor can live in a child frame or appear after a redirect.
export async function findLoginEditor(context, device) {
  for (const page of context.pages()) {
    for (const frame of page.frames()) {
      if (editorBlogId(frame.url()) !== device.blogId) continue;
      try {
        const title = frame.locator(".se-documentTitle .se-text-paragraph");
        if (await title.count() === 1 && await title.isVisible()) return frame;
      } catch {
        // Redirecting/detached frames can disappear during the check.
      }
    }
  }
  return null;
}

// Keep the authenticated browser alive, but remove only the confirmed empty
// login editor tab so the writer's existing-draft protection still works.
// Unknown structure, recovery prompts and any content always stay untouched.
export async function closeEmptyLoginEditor(frame, context) {
  try {
    if (await frame.getByText("작성 중인 글이 있습니다.", { exact: true }).isVisible()) return false;
    const container = frame.locator(".se-components-wrap");
    const title = frame.locator(".se-documentTitle .se-text-paragraph");
    if (await container.count() !== 1 || await title.count() !== 1) return false;
    const nodes = container.locator(".__se-node");
    const body = (await nodes.allTextContents()).join("").trim();
    const heading = (await title.locator(".__se-node").allTextContents()).join("").trim();
    const nonText = await container.locator(".se-component:not(.se-documentTitle):not(.se-text)").count();
    if (body || heading || nonText) return false;
    // Keep at least one tab open; do not rely on last-tab-close semantics.
    if (context.pages().length === 1) await context.newPage();
    await frame.page().close();
    return true;
  } catch { return false; }
}

export async function confirmNaverLogin(context, device, { wait = delay, attempts = 30 } = {}) {
  validateTarget(device);
  const waitForEditor = async count => {
    for (let i = 0; i < count; i++) {
      const editor = await findLoginEditor(context, device);
      if (editor) return editor;
      if (!context.pages().length) throw new Error("전용 Chrome 창이 닫혔습니다. 네이버 로그인 버튼으로 다시 열어주세요.");
      if (i + 1 < count) await wait(500);
    }
    return null;
  };
  const existing = await waitForEditor(Math.min(6, attempts));
  if (existing) return existing;

  // Login may land on Naver home instead of returning to the editor. Open a
  // separate tab; never navigate, clear, or type into an existing draft.
  const probe = await context.newPage();
  try {
    await probe.goto(writeUrl(device), { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch {
    // A timed-out navigation can still finish; inspect only after waiting.
  }
  const editor = await waitForEditor(attempts);
  if (editor) return editor;
  // An old login tab may remain open after successful authentication. Only
  // the fresh target probe's redirect is evidence of a current login demand.
  let loginPage = false;
  try { loginPage = new URL(probe.url()).hostname === "nid.naver.com"; } catch { /* closed probe */ }
  if (loginPage) throw new Error("대상 블로그 글쓰기가 네이버 로그인·보안 인증 화면으로 이동했습니다. 일반 Chrome이 아닌 도우미가 연 전용 Chrome에서 로그인과 추가 인증을 완료해주세요.");
  throw new Error("로그인 여부와 별개로 대상 블로그의 글쓰기 편집기를 확인하지 못했습니다. 해당 계정의 블로그 관리 권한, 보안 안내 또는 화면 로딩 상태를 확인해주세요. 원고는 입력하지 않았습니다.");
}
