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
  assert.doesNotMatch(source, /automation-diagnostics|getAutomationDiagnostics|자동화 연결 상태/);
});

test("탭 재진입은 캐시를 먼저 사용하고 강제 원격 동기화는 명시적 새로고침에만 사용한다", async () => {
  const dashboardHook = await readFile(new URL("../src/features/dashboard/useContents.ts", import.meta.url), "utf8");
  const homePage = await readFile(new URL("../src/features/operations/HomePage.tsx", import.meta.url), "utf8");
  assert.match(dashboardHook, /void refresh\(controller\.signal, !cached\)/);
  assert.match(homePage, /void refresh\(controller\.signal, !cachedContents && !cachedRuns && !cachedTrends\)/);
});

test("콘텐츠 목록은 내부 처리 단계를 운영자 상태로 노출하지 않는다", async () => {
  const dashboard = await readFile(new URL("../src/features/dashboard/DashboardPage.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /\{ key: "drafting", label: "작성 중" \}/);
  assert.match(dashboard, /\{ key: "ready", label: "완성" \}/);
  assert.match(dashboard, /\{ key: "scheduled", label: "예약 알림" \}/);
  assert.doesNotMatch(dashboard, /\{ key: "(?:planning|review|approved|tone)"/);
});
