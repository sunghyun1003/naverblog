import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("네이버 전송은 강제 서식과 인위적 대기 없이 기존 붙여넣기·저장 검증을 유지한다", async () => {
  const source = await readFile(new URL("../naver-editor.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /readableBlocks|paragraphPause|pasteBlock|typography\.mjs|setTimeout\(resolve, 80\)/);
  assert.match(source, /keyboard\.insertText\(job\.payload\.title\)/);
  assert.match(source, /keyboard\.press\("Control\+V"\)/);
  assert.match(source, /assertDocumentOrder\(expectedOrder, await readOrder\(container\)\)/);
  assert.match(source, /verifySavedDraft\(context, job, expectedOrder, uploadedImages\)/);
  assert.doesNotMatch(source, /generatedImageCaption/);
});
