import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../server/domain/errors.js";
import { hasPermission, requirePermission } from "../server/domain/permissions.js";

test("기획자는 파이프라인을 실행하지만 승인하지 못한다", () => {
  const planner = { id: "planner-1", roles: ["planner"] as const };
  assert.equal(hasPermission(planner, "pipeline:run"), true);
  assert.equal(hasPermission(planner, "content:approve"), false);
  assert.throws(
    () => requirePermission(planner, "content:approve"),
    (error: unknown) => error instanceof DomainError && error.code === "FORBIDDEN",
  );
});

test("관리자는 모든 운영 작업을 수행할 수 있다", () => {
  const admin = { id: "admin-1", roles: ["admin"] as const };
  for (const permission of ["content:create", "pipeline:run", "content:approve", "content:publish"] as const) {
    assert.equal(hasPermission(admin, permission), true);
  }
});
