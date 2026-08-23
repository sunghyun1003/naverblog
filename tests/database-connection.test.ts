import assert from "node:assert/strict";
import test from "node:test";
import { securePostgresConnectionString } from "../server/db/connection.js";

test("기존의 강한 SSL 동작을 verify-full로 명시한다", () => {
  assert.equal(
    securePostgresConnectionString("postgresql://user:pass@host/db?sslmode=require&channel_binding=require"),
    "postgresql://user:pass@host/db?sslmode=verify-full&channel_binding=require",
  );
  assert.equal(
    securePostgresConnectionString("postgresql://user:pass@host/db?sslmode=verify-full"),
    "postgresql://user:pass@host/db?sslmode=verify-full",
  );
  assert.equal(
    securePostgresConnectionString("postgresql://localhost/db"),
    "postgresql://localhost/db",
  );
});
