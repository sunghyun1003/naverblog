import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import JSZip from "jszip";
import { exportContentWord, WORD_CONTENT_TYPE } from "../server/services/word-export.js";
import type { ContentDetail } from "../server/domain/types.js";
import { buildApp } from "../server/http/app.js";
import { SessionAuthService } from "../server/services/session-auth.js";
import { testSystem } from "./helpers.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==", "base64");
const sha256 = createHash("sha256").update(png).digest("hex");
const image = async () => ({ body: png, contentType: "image/png" });
const expected = { versionId: "v2", updatedAt: "2026-10-08T00:00:00Z" };
function fixture(): ContentDetail {
  return {
    content: { id: "123", state: "approved", updatedAt: expected.updatedAt },
    versions: [
      { id: "v1", title: "이전 원고", body: "절대 사용하면 안 되는 과거 본문", metadata: {} },
      { id: "v2", title: "한화손보 캐롯 자동차보험, 가입 전 확인할 점", body: `# 한화손보 캐롯 자동차보험, 가입 전 확인할 점

## 핵심 포인트

한화손보 캐롯 자동차보험의 **보장 범위**를 확인하세요.

## 3줄 요약

- 첫 번째 요약
- 두 번째 요약
- 세 번째 요약

## 비교표

| 항목 | 확인할 내용 |
| --- | --- |
| 자기부담금 | 가입 조건을 확인하세요. |
| 보상 한도 | 상품별로 다를 수 있어요. |

3. 준비 단계
4. 다음 단계

> 계약 전 상품설명서와 약관을 확인해주세요.

## FAQ

### Q. 누구나 동일한가요?

아니요. *개별 조건*에 따라 달라요. & < > 특수문자도 그대로 표시해요.

[참고 약관](https://example.com/terms?a=1&b=2)

마지막 안내 문구입니다.`, metadata: { copyPackageHtml: "과거 HTML은 사용하지 마세요", imagePackage: {
        status: "ready", technicalQualityPassed: true, visualQualityPassed: true,
        assets: [
          { id: "hero", role: "hero", afterSection: 0, altText: "대표 이미지", sha256 },
          { id: "visual-01", role: "inline", afterSection: 2, altText: "비교 이미지", sha256 },
          { id: "visual-02", role: "inline", afterSection: 99, altText: "추가 이미지 · AI로 생성한 이미지입니다.", sha256 },
        ],
      } } },
    ],
  } as unknown as ContentDetail;
}
async function unpack(detail = fixture()) {
  const result = await exportContentWord(detail, expected, image);
  const zip = await JSZip.loadAsync(result.body, { checkCRC32: true });
  return { result, zip, xml: await zip.file("word/document.xml")!.async("string") };
}

test("Word는 최신 원고 전체를 편집 가능한 한글 본문·표·목록·링크로 보존한다", async () => {
  const { result, zip, xml } = await unpack();
  for (const text of ["핵심 포인트", "첫 번째 요약", "두 번째 요약", "세 번째 요약", "자기부담금", "보상 한도", "Q. 누구나 동일한가요?", "마지막 안내 문구입니다."]) assert.ok(xml.includes(text), text);
  assert.equal(xml.match(/한화손보 캐롯 자동차보험, 가입 전 확인할 점/g)?.length, 1);
  assert.doesNotMatch(xml, /과거 본문|과거 HTML|altChunk/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /<w:tblHeader/);
  assert.match(xml, /<w:numPr>/);
  assert.match(xml, /&amp; &lt; &gt;/);
  assert.match(await zip.file("word/styles.xml")!.async("string"), /eastAsia="맑은 고딕"/);
  assert.match(await zip.file("word/_rels/document.xml.rels")!.async("string"), /https:\/\/example.com\/terms/);
  assert.equal(result.filename, `${fixture().versions.at(-1)!.title}.docx`);
});
test("적용 이미지는 외부 링크 없이 파일에 내장하고 주석과 배치 순서를 유지한다", async () => {
  const { result, zip, xml } = await unpack();
  assert.equal(result.imageCount, 3);
  assert.equal(xml.match(/<w:drawing>/g)?.length, 3);
  assert.equal(xml.match(/<w:t[^>]*>[^<]*AI로 생성한 이미지입니다./g)?.length, 3);
  assert.ok(xml.indexOf("대표 이미지 · AI") < xml.indexOf("핵심 포인트"));
  assert.ok(xml.indexOf("비교 이미지 · AI") > xml.indexOf("세 번째 요약"));
  assert.ok(xml.indexOf("비교 이미지 · AI") < xml.indexOf(">비교표<"));
  assert.ok(xml.indexOf("추가 이미지 · AI") > xml.indexOf("마지막 안내 문구"));
  const embedded = Object.values(zip.files).filter(file => file.name.startsWith("word/media/") && !file.dir);
  assert.equal(embedded.length, 1); // Identical binary fixtures are deduplicated by docx.
  assert.deepEqual(await embedded[0]!.async("nodebuffer"), png);
  assert.doesNotMatch(await zip.file("word/_rels/document.xml.rels")!.async("string"), /Type="[^"]*\/image"[^>]*TargetMode="External"/);
});
test("사용자가 채택한 반려 이미지는 포함하고 본문에서 제외한 이미지는 넣지 않는다", async () => {
  const detail = fixture();
  Object.assign(detail.versions.at(-1)!.metadata.imagePackage as object, { status: "failed", visualQualityPassed: false, appliedAssetIds: ["visual-01"] });
  const { result, xml } = await unpack(detail);
  assert.equal(result.imageCount, 1);
  assert.equal(result.excludedImageCount, 2);
  assert.doesNotMatch(xml, /대표 이미지|추가 이미지/);
});
test("이미지 없는 미완성 저장 원고도 내보내되 제목과 마지막 문단을 생략하지 않는다", async () => {
  const detail = fixture(); detail.content.state = "drafting";
  delete detail.versions.at(-1)!.metadata.imagePackage;
  const { result, xml } = await unpack(detail);
  assert.equal(result.imageCount, 0);
  assert.match(xml, /마지막 안내 문구입니다/);
});
test("긴 원고·명시적 줄바꿈·다단계 목록·긴 표·특수문자 파일명을 잘라내지 않는다", async () => {
  const detail = fixture();
  const version = detail.versions.at(-1)!;
  delete version.metadata.imagePackage;
  version.title = '보험료 비교: "확인/주의"?';
  version.body = Array.from({ length: 160 }, (_, index) => `문단-${index}: 보장 범위와 책임기간을 확인합니다.`).join("\n\n")
    + "\n\n첫 줄\n둘째 줄<br>셋째 줄\n\n- 부모 항목\n  - 자식 항목\n\n| 항목 | 내용 |\n| --- | --- |\n"
    + Array.from({ length: 45 }, (_, index) => `| 행-${index} | 긴 표도 모두 보존합니다. |`).join("\n");
  const { result, xml } = await unpack(detail);
  for (let index = 0; index < 160; index++) assert.ok(xml.includes(`문단-${index}:`));
  for (let index = 0; index < 45; index++) assert.ok(xml.includes(`행-${index}`));
  assert.match(xml, /<w:br\/>/);
  assert.match(xml, /자식 항목/);
  assert.doesNotMatch(result.filename, /[:"/\\?]/);
  assert.ok(result.filename.endsWith(".docx"));
});
test("이미지 오류·파일 변경·깨진 파일·선택 불일치 시 부분 파일을 성공으로 반환하지 않는다", async () => {
  await assert.rejects(() => exportContentWord(fixture(), expected, async () => { throw new Error("404"); }), /이미지 파일을 확인하지/);
  await assert.rejects(() => exportContentWord(fixture(), expected, async () => ({ body: Buffer.from("changed"), contentType: "image/png" })), /이미지 파일을 확인하지/);
  const detail = fixture(); Object.assign(detail.versions.at(-1)!.metadata.imagePackage as object, { appliedAssetIds: ["missing"] });
  await assert.rejects(() => unpack(detail), /적용된 이미지 정보/);
});
test("원고 변경·삭제·진행 중·빈 본문과 외부 이미지는 명시적으로 거절한다", async () => {
  await assert.rejects(() => exportContentWord(fixture(), { ...expected, versionId: "old" }, image), /변경됐거나/);
  await assert.rejects(() => exportContentWord(fixture(), { ...expected, updatedAt: "old" }, image), /변경됐거나/);
  for (const change of ["deleted", "busy", "empty", "external"]) {
    const detail = fixture();
    if (change === "deleted") detail.content.state = "deleted";
    if (change === "busy") detail.content.imageGenerationStatus = "queued";
    if (change === "empty") detail.versions.at(-1)!.body = "";
    if (change === "external") detail.versions.at(-1)!.body += "\n\n![외부 이미지](http://localhost/private)";
    await assert.rejects(() => unpack(detail));
  }
});
test("Word HTTP 다운로드는 로그인 필수이며 파일명·타입·no-store·버전 확인을 보장한다", async context => {
  const system = testSystem();
  const detail = fixture(); delete detail.versions.at(-1)!.metadata.imagePackage;
  context.mock.method(system.contentService, "detail", async () => detail);
  const auth = new SessionAuthService({ username: "test", password: "test", sessionSecret: "test-only-secret", secureCookie: false });
  const app = buildApp({ system, auth });
  context.after(() => app.close());
  const url = `/api/contents/123/word?${new URLSearchParams(expected)}`;
  assert.equal((await app.inject(url)).statusCode, 401);
  const cookie = auth.sessionCookie({ username: "test", expiresAt: Date.now() + 60_000 });
  const response = await app.inject({ url, headers: { cookie } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], WORD_CONTENT_TYPE);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  assert.match(String(response.headers["content-disposition"]), /filename\*=UTF-8''%/);
  await JSZip.loadAsync(response.rawPayload, { checkCRC32: true });
  const stale = await app.inject({ url: "/api/contents/123/word?versionId=old&updatedAt=old", headers: { cookie } });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, "WORD_EXPORT_STALE");
});
