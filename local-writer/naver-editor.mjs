// Conservative UI adapter. No private Naver API, cookie extraction, stealth,
// CAPTCHA handling or publication operation. Editor changes fail closed.
import { escapeHtml, assertDocumentOrder } from "./document.mjs";

const normal = value => value.replace(/\s+/g, "").normalize("NFC");
const writeUrl = blogId => `https://blog.naver.com/PostWriteForm.naver?blogId=${encodeURIComponent(blogId)}`;
const imageKey = src => { const url = new URL(src); return url.origin + url.pathname; };
const readOrder = container => container.locator(".se-component:not(.se-documentTitle)").evaluateAll(elements => elements.map(el => el.classList.contains("se-image")
  ? { kind: "image" } : { kind: "text", text: [...el.querySelectorAll(".__se-node")].map(node => node.textContent ?? "").join("") }));

export async function loadedEditorImages(frame, count) {
  const images = frame.locator(".se-components-wrap .se-component.se-image img");
  const sources = [];
  for (let index = 0; index < count; index++) {
    // Naver uses data: placeholders below the viewport. complete/naturalWidth
    // alone would falsely accept a placeholder as a successfully saved image.
    await images.nth(index).scrollIntoViewIfNeeded();
    await frame.waitForFunction(({ index, count }) => {
      const imgs = [...document.querySelectorAll(".se-components-wrap .se-component.se-image img")];
      const img = imgs[index];
      return imgs.length === count && img?.complete && img.naturalWidth > 0 && /^https:\/\//.test(img.src);
    }, { index, count }, { timeout: 30_000 });
    sources.push(await images.nth(index).evaluate(img => img.src));
  }
  return sources;
}

/** Read back from Naver's saved list, not from the just-edited browser DOM.
 * Never discard recovery input or pick between ambiguous same-title drafts. */
export async function verifySavedDraft(context, job, expectedOrder, uploadedImages) {
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(writeUrl(job.blogId), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  const url = new URL(page.url());
  if (url.origin !== "https://blog.naver.com" || url.searchParams.get("blogId") !== job.blogId) throw new Error("저장 결과를 확인할 블로그에 접근하지 못했습니다.");
  await page.locator(".se-documentTitle").waitFor({ state: "visible" });
  if (await page.getByText("작성 중인 글이 있습니다.", { exact: true }).isVisible()) throw new Error("다시 열린 편집기에 복구할 내용이 있습니다. 기존 입력을 건드리지 않고 저장 결과 확인을 멈췄습니다.");
  await page.getByRole("button", { name: /임시저장된 글 보기/ }).click();
  const entry = page.locator('button[data-click-area="tpb*s.tlist"]').filter({ has: page.getByText(job.payload.title, { exact: true }) });
  await entry.first().waitFor({ state: "visible" });
  if (await entry.count() !== 1) throw new Error("같은 제목의 임시저장 글이 여러 개입니다. 임의로 선택하지 않으므로 저장 목록을 확인해주세요.");
  await entry.click();
  await page.waitForFunction(title => [...document.querySelectorAll(".se-documentTitle .__se-node")].map(el => el.textContent ?? "").join("") === title, job.payload.title);
  const container = page.locator(".se-components-wrap");
  const savedImages = await loadedEditorImages(page, job.payload.assets.length);
  assertDocumentOrder(expectedOrder, await readOrder(container));
  if (JSON.stringify(savedImages.map(imageKey)) !== JSON.stringify(uploadedImages.map(imageKey))) throw new Error("다시 연 임시저장 글의 이미지가 업로드한 이미지와 다릅니다.");
  await page.locator(".se-documentTitle").scrollIntoViewIfNeeded();
  return page;
}

export async function writeNaverDraft(context, job, plan, images, report) {
  if (context.pages().some(tab => {
    const url = new URL(tab.url());
    return url.origin === "https://blog.naver.com" && url.pathname === "/PostWriteForm.naver";
  })) throw new Error("전용 브라우저에 이전 네이버 편집기가 열려 있습니다. 해당 글을 확인하고 편집기 탭을 닫은 뒤 다시 요청해주세요. 기존 내용은 건드리지 않았습니다.");
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  // Login and security challenges are intentionally left to the account owner.
  await page.goto(writeUrl(job.blogId), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  if (new URL(page.url()).hostname !== "blog.naver.com") throw new Error("네이버 로그인이 필요합니다. 도우미 브라우저에서 직접 로그인해주세요.");
  const findEditor = async () => {
    for (const frame of page.frames()) {
      const url = new URL(frame.url());
      if (url.origin !== "https://blog.naver.com" || url.searchParams.get("blogId") !== job.blogId) continue;
      if (await frame.locator(".se-documentTitle .se-text-paragraph").count() === 1) return frame;
    }
    return null;
  };
  let frame = null;
  for (let attempt = 0; attempt < 15 && !frame; attempt++) {
    frame = await findEditor();
    if (!frame) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!frame) throw new Error("지정한 블로그의 편집기를 확인하지 못했습니다. 로그인·보안 안내 또는 편집기 변경을 확인해주세요.");
  if (await frame.getByText("작성 중인 글이 있습니다.", { exact: true }).isVisible()) {
    throw new Error("네이버에 작성 중이던 글이 있습니다. 열린 창에서 기존 글을 먼저 확인해주세요. 자동으로 지우거나 이어 쓰지 않습니다.");
  }
  const title = frame.locator(".se-documentTitle .se-text-paragraph");
  const container = frame.locator(".se-components-wrap");
  const paragraphs = container.locator(".se-component.se-text .se-text-paragraph");
  if (await container.count() !== 1 || !await title.isVisible() || !await paragraphs.count()) throw new Error("편집기 구조를 확인하지 못해 입력하지 않았습니다.");
  const authorText = async locator => (await locator.locator(".__se-node").allTextContents()).join("");
  const onlyEmptyText = await container.locator(".se-component").evaluateAll(elements => elements.every(el => el.classList.contains("se-text") || el.classList.contains("se-documentTitle")));
  if ((await authorText(title)).trim() || (await authorText(container)).trim() || !onlyEmptyText) {
    throw new Error("편집기에 기존 내용이 있어 덮어쓰지 않았습니다. 기존 글을 먼저 확인해주세요.");
  }
  // Dedicated context; never attach to the user's ordinary Chrome profile.
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://blog.naver.com" });
  const expected = [];
  const expectedOrder = [];
  let needsBodyFocus = true;
  async function paste(html) {
    const plain = await page.evaluate(async value => {
      const doc = new DOMParser().parseFromString(value, "text/html");
      const text = doc.body.textContent ?? "";
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([value], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      return text;
    }, html);
    // SmartEditor uses its own selection model. Re-clicking a filled paragraph
    // puts the caret in its middle; Ctrl+End does not reliably fix that. Keep the
    // real caret after each paste, and only focus the new empty block after an
    // image. This avoids splitting an earlier sentence with a later section.
    if (needsBodyFocus) { await paragraphs.last().click(); needsBodyFocus = false; }
    await page.keyboard.press("Control+V");
    expected.push(plain);
    expectedOrder.push({ kind: "text", text: plain });
    await frame.waitForFunction(({ chunks }) => {
      const actual = [...document.querySelectorAll(".se-components-wrap .__se-node")].map(el => el.textContent ?? '').join('');
      return chunks.every(text => actual.replace(/\s+/g, "").includes(text.replace(/\s+/g, "")));
    }, { chunks: expected });
    await page.keyboard.press("Enter");
  }
  await report("제목과 원고를 네이버 편집기에 입력하고 있습니다.");
  await title.click(); await page.keyboard.insertText(job.payload.title);
  let imageCount = 0;
  for (const item of plan) {
    await report("원고와 이미지 순서를 확인하며 입력하고 있습니다.");
    if (item.kind === "html") { await paste(item.html); continue; }
    const data = images.get(item.asset.id);
    if (!data) throw new Error("이미지 파일이 준비되지 않았습니다.");
    if (needsBodyFocus) { await paragraphs.last().click(); needsBodyFocus = false; }
    // Locate a single image picker only; don't click unrelated file controls.
    const inputs = frame.locator('input[type="file"][accept*="image"]');
    if (await inputs.count() === 1) {
      await inputs.setInputFiles({ name: `${item.asset.id}.jpg`, mimeType: data.type, buffer: data.bytes });
    } else {
      const photo = frame.locator('button.se-image-toolbar-button[data-name="image"]');
      if (await photo.count() !== 1) throw new Error("사진 업로드 버튼을 확인하지 못했습니다.");
      const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10_000 }), photo.click()]);
      await chooser.setFiles({ name: `${item.asset.id}.jpg`, mimeType: data.type, buffer: data.bytes });
    }
    imageCount++;
    expectedOrder.push({ kind: "image" });
    await frame.waitForFunction(count => {
      const imgs = [...document.querySelectorAll(".se-components-wrap .se-component.se-image img")];
      return imgs.length === count && imgs.every(img => img.complete && img.naturalWidth > 0 && /^https:\/\//.test(img.src));
    }, imageCount, { timeout: 30_000 });
    // Only append to an actual text paragraph after the image. If Naver doesn't
    // create one automatically, stop instead of inserting text before the image.
    const lastIsText = await container.locator(".se-component").last().evaluate(el => el.classList.contains("se-text"));
    if (!lastIsText) throw new Error("이미지 뒤 입력 위치를 확인하지 못했습니다. 열린 편집기에 원고가 남아 있습니다.");
    needsBodyFocus = true;
    if (item.asset.altText) await paste(`<p>${escapeHtml(item.asset.altText)}</p>`);
  }
  if (normal(await title.innerText()) !== normal(job.payload.title)) throw new Error("제목이 원본과 일치하지 않습니다.");
  const actual = normal(await authorText(container));
  let cursor = 0;
  for (const chunk of expected) {
    const index = actual.indexOf(normal(chunk), cursor);
    if (index < 0) throw new Error("본문 순서 또는 일부 문장이 원본과 다릅니다.");
    cursor = index + normal(chunk).length;
  }
  if (await container.locator(".se-component.se-image").count() !== job.payload.assets.length) throw new Error("본문 이미지 수가 원본과 다릅니다.");
  assertDocumentOrder(expectedOrder, await readOrder(container));
  const uploadedImages = await container.locator(".se-component.se-image img").evaluateAll(elements => elements.map(img => img.src));
  // Observed 2026-09-27: '저장' saves a temporary draft; '발행' is separate.
  const save = frame.getByRole("button", { name: "저장", exact: true });
  if (await save.count() !== 1) throw new Error("임시저장 버튼을 명확히 확인하지 못했습니다. 발행 버튼은 누르지 않습니다.");
  const savedList = frame.getByRole("button", { name: /임시저장된 글 보기/ });
  const countBefore = Number((await savedList.innerText()).trim());
  if (!Number.isInteger(countBefore) || countBefore < 0) throw new Error("기존 임시저장 목록을 확인하지 못했습니다.");
  await report("본문과 이미지 입력을 확인했습니다. 임시저장 버튼을 누릅니다.");
  await save.click();
  await frame.waitForFunction(before => {
    const button = document.querySelector('button[aria-label^="임시저장된 글 보기"]');
    return button && Number(button.textContent.trim()) > before;
  }, countBefore, { timeout: 30_000 });
  await report("임시저장 목록에서 글을 다시 열어 본문과 이미지 저장 결과를 확인합니다.");
  // A second active editor causes Naver's recovery popup. The save count has
  // confirmed persistence, so close our own saved editor before reading back.
  await page.close();
  await verifySavedDraft(context, job, expectedOrder, uploadedImages);
  return "네이버 임시저장 글을 다시 열어 제목·본문·이미지와 순서를 확인했습니다. 발행은 하지 않았습니다.";
}
