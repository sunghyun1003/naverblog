type Entry<T> = { value: T; storedAt: number };

const values = new Map<string, Entry<unknown>>();
const MAX_AGE_MS = 5 * 60_000;

export function readRuntimeCache<T>(key: string): T | null {
  const entry = values.get(key);
  if (!entry || Date.now() - entry.storedAt > MAX_AGE_MS) return null;
  return entry.value as T;
}

export function writeRuntimeCache<T>(key: string, value: T): T {
  values.set(key, { value, storedAt: Date.now() });
  return value;
}

export function clearRuntimeCache(prefix?: string): void {
  if (!prefix) {
    values.clear();
    return;
  }
  for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
}
