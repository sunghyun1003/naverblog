import type { ContentDetail, ContentVersion } from "./types.js";

// Recovery belongs to the current version. Persist it in existing JSON metadata
// so cache/database reads retain the same retry action as a fresh GitHub read.
export function recoveryFromVersions(versions: ContentVersion[]): NonNullable<ContentDetail["recovery"]> | null {
  const latest = [...versions].sort((a, b) => b.sequence - a.sequence)[0];
  const value = latest?.metadata.generationRecovery;
  if (!value || typeof value !== "object") return null;
  const candidate = value as NonNullable<ContentDetail["recovery"]>;
  if (typeof candidate.failedStage !== "string" || typeof candidate.message !== "string"
    || !["evidence", "article", "tone", "images"].includes(candidate.resumeFrom)
    || !Array.isArray(candidate.artifacts)) return null;
  return candidate;
}
