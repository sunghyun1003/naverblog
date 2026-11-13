import test from "node:test";
import assert from "node:assert/strict";
import { confirmNaverLogin } from "../login.mjs";

const device = { blogId: "hanwhains_carrot", category: { id: "63", name: "자동차보험" } };
const url = "https://blog.naver.com/hanwhains_carrot/postwrite?categoryNo=63";
const frame = (address, visible = () => true) => ({ url: () => address,
  locator: () => ({ count: async () => 1, isVisible: async () => visible() }) });
function fixture(frames, probeFrames = frames, probeUrl = url) {
  const original = { frames: () => frames, url: () => "https://blog.naver.com/hanwhains_carrot" };
  const pages = [original];
  const calls = [];
  return { calls, original, context: { pages: () => pages, newPage: async () => {
    const page = { frames: () => probeFrames, url: () => probeUrl, goto: async (address, options) => calls.push({ address, options }) };
    pages.push(page); return page;
  } } };
}
const fast = { wait: async () => {}, attempts: 2 };

test("login recognizes target editor inside a child frame without opening a new tab", async () => {
  const editor = frame(url);
  const f = fixture([frame("https://blog.naver.com/hanwhains_carrot"), editor]);
  assert.equal(await confirmNaverLogin(f.context, device, fast), editor);
  assert.equal(f.calls.length, 0);
});
test("login waits for editor rendering instead of rejecting a completed login immediately", async () => {
  let ready = false;
  const editor = frame(url, () => ready);
  const f = fixture([editor]);
  assert.equal(await confirmNaverLogin(f.context, device, { attempts: 2, wait: async () => { ready = true; } }), editor);
  assert.equal(f.calls.length, 0);
});
test("login landing on home opens target editor separately without changing existing input", async () => {
  const editor = frame(url);
  const f = fixture([], [editor]);
  assert.equal(await confirmNaverLogin(f.context, device, fast), editor);
  assert.equal(f.calls[0].address, url);
  assert.equal(f.context.pages()[0], f.original);
});
test("a different blog's editor is never sufficient to confirm login", async () => {
  const f = fixture([frame("https://blog.naver.com/another_blog/postwrite")], []);
  await assert.rejects(confirmNaverLogin(f.context, device, fast), /관리 권한/);
});
test("actual login redirect has a distinct actionable message", async () => {
  const f = fixture([], [], "https://nid.naver.com/nidlogin.login");
  await assert.rejects(confirmNaverLogin(f.context, device, fast), /로그인·보안 인증 화면으로 이동/);
});
test("closed dedicated browser is not reported as incorrect credentials", async () => {
  await assert.rejects(confirmNaverLogin({ pages: () => [] }, device, fast), /창이 닫혔습니다/);
});
test("detached frame does not prevent checking another target frame", async () => {
  const detached = { url: () => url, locator: () => { throw new Error("detached"); } };
  const editor = frame(url);
  const f = fixture([detached, editor]);
  assert.equal(await confirmNaverLogin(f.context, device, fast), editor);
});
