import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readableBlocks, paragraphPause } from "../typography.mjs";

test("문단 길이에 비례한 전송 대기는 짧은 문단과 긴 문단 모두 유한하다", () => {
  assert.equal(paragraphPause(""), 1200);
  assert.equal(paragraphPause("가".repeat(100)), 10000);
  assert.equal(paragraphPause("가".repeat(500)), 20000);
});

test("실제 DOM에서 전송 서식·텍스트·링크·모바일 줄바꿈을 보존한다", { skip: process.platform !== "win32" }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const html = '<h2>3줄 요약</h2><p>문장과 <strong>강조</strong>를 보존합니다.<br>다음 줄입니다.</p><blockquote><p>인용문의 의미를 그대로 유지합니다.</p></blockquote><ul><li>첫 항목</li><li>두 번째</li></ul><p><a href="https://example.com">공식 출처</a></p><p>확인필-테스트</p>';
    const before = await page.evaluate(html => new DOMParser().parseFromString(html, "text/html").body.textContent, html);
    const blocks = await page.evaluate(readableBlocks, html);
    assert.equal(blocks.map(block => block.text).join(""), before);
    await page.setContent(`<main style="max-width:760px;margin:auto" contenteditable="true">${blocks.map(block => block.html).join("")}</main>`);
    assert.equal(await page.locator("blockquote").count(), 0);
    assert.equal(await page.locator("strong").innerText(), "강조");
    assert.equal(await page.locator("a").getAttribute("href"), "https://example.com");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const style = await page.locator("p").first().evaluate(p => ({ size: getComputedStyle(p.querySelector("span")).fontSize, line: getComputedStyle(p).lineHeight, align: getComputedStyle(p).textAlign }));
      assert.deepEqual(style, { size: "17px", line: "32.3px", align: "left" });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator("main").click();
      assert.equal(await page.locator("main").evaluate(el => el === document.activeElement), true);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
