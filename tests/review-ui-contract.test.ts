import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("원고 상세 화면은 최종 승인 체크박스를 다시 노출하지 않는다", async () => {
  const source = await readFile(new URL("../src/features/review/ReviewPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /최종 승인 확인/);
  assert.doesNotMatch(source, /final-checks/);
  assert.doesNotMatch(source, /type=\"checkbox\"/);
  assert.doesNotMatch(source, /approveApi/);
});

test("모바일 원고 상세 헤더는 버튼을 가로 스크롤로 숨기지 않는다", async () => {
  const source = await readFile(new URL("../src/styles/product-theme.css", import.meta.url), "utf8");
  const mobileBlockStart = source.lastIndexOf("@media (max-width: 767px)", source.indexOf("/*\n * Shared page frame"));
  const mobileBlock = source.slice(mobileBlockStart, source.indexOf("/*\n * Shared page frame"));
  assert.match(mobileBlock, /\.review-header__actions[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobileBlock, /\.review-header__actions[\s\S]*overflow: visible/);
  assert.doesNotMatch(mobileBlock, /\.review-header__actions \{ max-width: 52vw; overflow-x: auto; \}/);
});
