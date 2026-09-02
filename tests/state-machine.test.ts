import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../server/domain/errors.js";
import { assertTransition, canTransition, listAllowedTransitions } from "../server/domain/state-machine.js";

test("정상 상태 전이를 허용한다", () => {
  assert.equal(canTransition("idea", "researching"), true);
  assert.equal(canTransition("review_ready", "approved"), true);
  assert.equal(canTransition("review_ready", "scheduled"), true);
  assert.deepEqual(listAllowedTransitions("published"), ["measured"]);
});

test("건너뛰는 상태 전이를 거부한다", () => {
  assert.throws(
    () => assertTransition("idea", "published"),
    (error: unknown) => error instanceof DomainError && error.code === "INVALID_CONTENT_TRANSITION" && error.statusCode === 409,
  );
});
