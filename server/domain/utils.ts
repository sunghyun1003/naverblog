import { createHash, randomUUID } from "node:crypto";

export type Clock = () => string;
export type IdFactory = () => string;

export const systemClock: Clock = () => new Date().toISOString();
export const randomId: IdFactory = () => randomUUID();

export function stableKey(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString().replace(/\/$/, "");
}
