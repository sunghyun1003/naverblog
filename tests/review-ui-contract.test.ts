import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("브라우저 데이터 검사에서도 AI 없는 저장 복구 단계를 허용한다", async () => {
  const client = await readFile(new URL("../src/api/client.ts", import.meta.url), "utf8");
  assert.match(client, /\["evidence", "article", "tone", "render", "images"\]\.includes\(asString\(source\.recovery\.resumeFrom\)\)/);
  const view = await readFile(new URL("../src/features/review/ReviewPage.tsx", import.meta.url), "utf8");
  assert.match(view, /render: "원고 저장 \(AI 호출 없음\)"/);
});

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

test("완성 원고 본문은 원고별 이미지 패키지를 직접 전달해 렌더링한다", async () => {
  const source = await readFile(new URL("../src/features/review/ReviewPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /generatedImageContext/);
  assert.match(source, /renderGeneratedBlocksWithImages\(body, contentId, imagePackage\)/);
  assert.match(source, /<img src=\{contentImageUrl\(contentId, hero\.id/);
  assert.match(source, /<img src=\{contentImageUrl\(contentId, asset\.id/);
});

test("원고 수정 완료는 복구 정보 유무가 아니라 명시적인 작업 결과로 판정한다", async () => {
  const source = await readFile(new URL("../src/features/review/ReviewPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /if \(!next.recovery/);
  assert.match(source, /next.content.rewriteStatus === "completed"/);
  assert.match(source, /next.content.rewriteStatus === "failed"/);
  assert.match(source, /const withoutUnavailableImages = removeUnavailableImages\(source\)/);
});
