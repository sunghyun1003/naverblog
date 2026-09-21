import { createHash } from "node:crypto";
import type { GeneratedImageManifest } from "./github-automation.js";

/** An operator choice, not a replacement for the original automated review. */
export interface ImageSelection {
  manifestKey: string;
  revision: number;
  assetIds: string[];
  acknowledgedRejectedIds: string[];
  selectedAt: string;
  selectedBy: string;
}

export function imageManifestKey(manifest: GeneratedImageManifest): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export function imageReviewAccepted(manifest: GeneratedImageManifest, id: string): boolean {
  const review = manifest.visualQuality?.assets?.find(item => item.id === id);
  const usablePolicy = manifest.visualQuality?.policyVersion === 2;
  return review?.passed === true && review.defects.length === 0
    && (!usablePolicy || Array.isArray(review.warnings))
    && (usablePolicy ? [review.scores.realism, review.scores.composition, review.scores.artifactControl]
      : [review.scores.realism, review.scores.composition, review.scores.artifactControl, review.scores.novelty ?? 4])
      .every(score => Number.isInteger(score) && score >= (usablePolicy ? 3 : 4) && score <= 5)
    && Number.isInteger(review.scores.relevance) && review.scores.relevance >= 3 && review.scores.relevance <= 5;
}

export function validImageSelection(manifest: GeneratedImageManifest | null | undefined, selection: ImageSelection | null | undefined, revision: number): boolean {
  return Boolean(manifest && selection && selection.manifestKey === imageManifestKey(manifest) && selection.revision === revision);
}

export function appliedImageIds(manifest: GeneratedImageManifest | null | undefined, selection?: ImageSelection | null, revision = 1): string[] {
  if (!manifest || !manifest.technicalQualityPassed) return [];
  if (selection && validImageSelection(manifest, selection, revision)) {
    return manifest.assets.filter(asset => selection.assetIds.includes(asset.id)
      && (imageReviewAccepted(manifest, asset.id) || selection.acknowledgedRejectedIds.includes(asset.id))).map(asset => asset.id);
  }
  return manifest.status === "ready" && manifest.visualQualityPassed === true
    ? manifest.assets.map(asset => asset.id) : [];
}

export function imageUsageMetadata(manifest: GeneratedImageManifest, selection: ImageSelection | null | undefined, revision: number) {
  const validSelection = validImageSelection(manifest, selection, revision);
  return { ...manifest, manifestKey: imageManifestKey(manifest),
    appliedAssetIds: appliedImageIds(manifest, selection, revision),
    selection: validSelection ? selection ?? null : null };
}
