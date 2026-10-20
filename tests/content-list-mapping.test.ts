import assert from "node:assert/strict";
import test from "node:test";
import { mapContent } from "../src/api/mapping";
import type { ApiContent } from "../src/api/types";

test("상태를 변경한 예전 원고의 생성일은 수정일로 바뀌지 않고 한국 날짜로 표시한다", () => {
  const item = mapContent({ id: "old", title: "예전 원고", state: "approved", assigneeId: null,
    createdAt: "2026-08-30T21:00:00Z", updatedAt: "2026-10-16T17:52:00Z", scheduledAt: null } as ApiContent);
  assert.equal(item.createdAt, "2026. 08. 31.");
  assert.equal(item.updatedAt, "2026. 10. 17.");
  assert.equal(item.status, "ready");
});

test("원고 고정 번호를 API 값 그대로 사용한다", () => {
  const item = mapContent({ id: "x", number: 42, title: "x", state: "drafting", createdAt: "", updatedAt: "", scheduledAt: null } as ApiContent);
  assert.equal(item.number, 42);
});

test("날짜가 없거나 손상돼도 신규 생성 날짜를 만들어내지 않는다", () => {
  const item = mapContent({ id: "x", title: "x", state: "drafting", createdAt: "invalid", updatedAt: "invalid", scheduledAt: null } as ApiContent);
  assert.equal(item.createdAt, "생성일 확인 중");
});
