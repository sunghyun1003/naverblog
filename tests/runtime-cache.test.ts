import assert from "node:assert/strict";
import test from "node:test";
import { cachedRequest, clearRuntimeCache, invalidateRuntimeCache, readRuntimeCache, writeRuntimeCache, setRuntimeCacheUser, withAbort } from "../src/api/runtimeCache.js";

test("tab changes share one request and aborting the old tab does not cancel the new tab", async () => {
  clearRuntimeCache();
  let resolve!: (value: number) => void;
  let calls = 0;
  const load = () => { calls++; return new Promise<number>((done) => { resolve = done; }); };
  const old = new AbortController();
  const first = withAbort(cachedRequest("shared", load), old.signal);
  const second = cachedRequest("shared", load);
  old.abort();
  await assert.rejects(first, { name: "AbortError" });
  resolve(42);
  assert.equal(await second, 42);
  assert.equal(calls, 1);
});

test("expired freshness retains data for rendering but revalidates on request", async () => {
  clearRuntimeCache();
  writeRuntimeCache("list", [1]);
  invalidateRuntimeCache();
  assert.deepEqual(readRuntimeCache("list"), [1]);
  assert.deepEqual(await cachedRequest("list", async () => [2]), [2]);
});

test("a request completed after logout cannot refill the cache", async () => {
  clearRuntimeCache();
  let resolve!: (value: string) => void;
  const response = cachedRequest("private", () => new Promise<string>((done) => { resolve = done; }));
  clearRuntimeCache(); resolve("old-user-data"); await assert.rejects(response, { name: "AbortError" });
  assert.equal(readRuntimeCache("private"), null);
});

test("refreshing one endpoint cancels only its superseded result, not other page data", async () => {
  clearRuntimeCache();
  let finish!: (value: number) => void;
  const old = cachedRequest("request:contents", () => new Promise<number>((resolve) => { finish = resolve; }));
  const independent = cachedRequest("request:trends", async () => 7);
  clearRuntimeCache("request:contents");
  assert.equal(await cachedRequest("request:contents", async () => 2), 2);
  finish(1);
  await assert.rejects(old, { name: "AbortError" });
  assert.equal(await independent, 7);
  assert.equal(readRuntimeCache("request:contents"), 2);
});

test("changing authenticated users never shares private cache entries", () => {
  setRuntimeCacheUser("first"); writeRuntimeCache("private", "first");
  setRuntimeCacheUser("second"); assert.equal(readRuntimeCache("private"), null);
  clearRuntimeCache();
});

test("memory-only requests do not serialize the saved page cache again", async (context) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  let writes = 0;
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { writes++; saved.set(key, value); },
  } });
  context.after(() => {
    clearRuntimeCache();
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  });
  setRuntimeCacheUser("storage-test");
  writeRuntimeCache("trends", { items: ["full data"] });
  assert.equal(writes, 1);
  await cachedRequest("request:/api/trends/summary", async () => ({ itemCount: 1 }));
  clearRuntimeCache("request:/api/trends");
  assert.equal(writes, 1);
  writeRuntimeCache("trends:summary", { itemCount: 1 });
  assert.equal(writes, 2);
  assert.deepEqual(readRuntimeCache("trends"), { items: ["full data"] });
  assert.equal(JSON.parse([...saved.values()][0]!).length, 2);
  clearRuntimeCache();
  assert.equal([...saved.values()][0], "[]");
});
