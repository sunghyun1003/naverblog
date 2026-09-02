import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("운영 화면은 공통 중앙 캔버스와 좌우 여백을 사용한다", async () => {
  const source = await readFile(new URL("../src/styles/product-theme.css", import.meta.url), "utf8");
  const sharedFrame = source.slice(source.lastIndexOf("/*\n * Shared page frame"));

  assert.match(sharedFrame, /\.operations-page,\s*\.dashboard-page\s*\{[\s\S]*?width:\s*min\(100%,\s*1360px\)/);
  assert.match(sharedFrame, /\.operations-page,\s*\.dashboard-page\s*\{[\s\S]*?margin-right:\s*auto;[\s\S]*?margin-left:\s*0/);
  assert.match(sharedFrame, /\.dashboard-page\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+300px/);
});

test("설정 화면도 다른 운영 화면과 같은 상단 리듬을 갖는다", async () => {
  const source = await readFile(new URL("../src/features/operations/SettingsPage.tsx", import.meta.url), "utf8");
  assert.match(source, /className="operations-heading settings-heading"/);
});
