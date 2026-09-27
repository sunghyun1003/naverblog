import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { transferPlan, previewHtml, assertDocumentOrder } from "../document.mjs";

const payload = (overrides = {}) => {
  const value = { schemaVersion: 1, contentId: "123", versionId: "v2", title: "테스트 원고", body: "# 테스트 원고\n\n처음 문단\n\n## 3줄 요약\n\n- 하나\n- 둘\n- 셋\n\n## 주요 내용\n\n**중요한 설명**\n\n## FAQ\n\n### 질문은?\n\n답변입니다.\n\n## 출처\n\n[공식 근거](https://example.com)\n\n> 개별 약관을 확인해주세요.",
    assets: [{ id: "hero", role: "hero", afterSection: 0, altText: "대표 이미지", sha256: "a".repeat(64) },
      { id: "visual-01", role: "inline", afterSection: 2, altText: "본문 이미지", sha256: "b".repeat(64) }], ...overrides };
  return { ...value, fingerprint: createHash("sha256").update(JSON.stringify(value)).digest("hex") };
};
test("제목 중복 없이 원문·3줄 요약·FAQ·링크·안내문과 이미지 순서를 보존", () => {
  const value = payload(); const plan = transferPlan(value);
  assert.equal(plan[0].asset.id, "hero");
  assert.equal(plan[3].html.trim(), "<h2>주요 내용</h2>\n<p><strong>중요한 설명</strong></p>");
  assert.equal(plan[4].asset.id, "visual-01");
  const html = previewHtml(value, plan);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  for (const text of ["FAQ", "답변입니다.", "https://example.com", "개별 약관"]) assert.ok(html.includes(text));
});
test("일치하지 않는 이미지 위치를 조용히 버리지 않는다", () => {
  const value = payload(); value.assets[1].afterSection = 999;
  assert.throws(() => transferPlan(value), /변경/);
  assert.throws(() => transferPlan(payload({ assets: value.assets })), /이미지 위치/);
});
test("원고 HTML과 위험한 링크는 실행되지 않게 처리", () => {
  const value = payload({ body: "<script>alert(1)</script>\n\n[위험](javascript:alert%281%29)\n\n![외부](https://evil.example/tracker)", assets: [payload().assets[0]] });
  const html = previewHtml(value, transferPlan(value));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes("evil.example"));
  assert.ok(html.includes("Content-Security-Policy"));
});
test("이미지 수뿐 아니라 본문의 앞뒤 순서와 텍스트 유실까지 검사", () => {
  const text = text => ({ kind: "text", text }); const image = { kind: "image" };
  const expected = [image, text("문단 하나"), text("요약과 FAQ"), image, text("출처")];
  assert.doesNotThrow(() => assertDocumentOrder(expected, [image, text("문단 하나\n요약과 FAQ"), image, text("출처")]));
  assert.throws(() => assertDocumentOrder(expected, [image, text("문단 하나"), image, text("요약과 FAQ출처")]), /이미지 위치/);
  assert.throws(() => assertDocumentOrder(expected, [image, text("문단 하나"), image, text("출처")]), /문장/);
});
