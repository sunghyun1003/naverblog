type Entry<T> = { value: T; storedAt: number };
const values = new Map<string, Entry<unknown>>();
const pending = new Map<string, Promise<unknown>>();
const MAX_AGE_MS = 24 * 60 * 60_000;
let userKey: string | null = null;
let epoch = 0;

// Restore only after session verification; drafts stay private and tab-local.
export function setRuntimeCacheUser(userId: string): void {
  const nextKey = `dashboard-cache:v2:${userId}`;
  if (nextKey === userKey) return;
  values.clear(); pending.clear(); epoch++;
  userKey = nextKey;
  try {
    const saved = JSON.parse(sessionStorage.getItem(nextKey) ?? "[]") as Array<[string, Entry<unknown>]>;
    if (!Array.isArray(saved)) return;
    for (const [key, entry] of saved) {
      if (typeof key === "string" && entry && typeof entry.storedAt === "number"
        && Date.now() - entry.storedAt < MAX_AGE_MS) values.set(key, entry);
    }
  } catch { /* Storage failure must not prevent navigation. */ }
}

function persist(): void {
  if (!userKey) return;
  try { sessionStorage.setItem(userKey, JSON.stringify([...values].filter(([key]) => !key.startsWith("request:")).slice(-80))); } catch { /* Keep the memory cache. */ }
}

export function readRuntimeCache<T>(key: string): T | null {
  const entry = values.get(key);
  if (!entry || Date.now() - entry.storedAt > MAX_AGE_MS) return null;
  return entry.value as T;
}

export function writeRuntimeCache<T>(key: string, value: T): T {
  values.set(key, { value, storedAt: Date.now() });
  // Raw request entries are memory-only. Saving one must not serialize every
  // normalized page again before that page's own cache entry is written.
  if (!key.startsWith("request:")) persist();
  return value;
}

export function clearRuntimeCache(prefix?: string): void {
  if (!prefix) { epoch++; pending.clear(); values.clear(); }
  else {
    for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
    for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
  }
  if (!prefix?.startsWith("request:")) persist();
}

export function invalidateRuntimeCache(): void {
  epoch++; pending.clear();
  // Retain the visible data, but require the next request to reconcile it.
  for (const entry of values.values()) entry.storedAt = Date.now() - 60_000;
  persist();
}

export function cachedRequest<T>(key: string, load: () => Promise<T>, maxAge = 10_000): Promise<T> {
  const cached = values.get(key);
  if (cached && Date.now() - cached.storedAt < maxAge) return Promise.resolve(cached.value as T);
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const startedEpoch = epoch;
  const promise = load().then((value) => {
    // Do not let callers normalize and re-save a response from before logout,
    // mutation, or an explicit refresh that superseded this request.
    if (startedEpoch !== epoch || pending.get(key) !== promise) throw new DOMException("Superseded", "AbortError");
    writeRuntimeCache(key, value);
    return value;
  }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
  pending.set(key, promise);
  return promise;
}

/** Leaving one page must not cancel the next page's shared request. */
export function withAbort<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
