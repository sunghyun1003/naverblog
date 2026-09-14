import type { ApiGeneratedImagePackage } from "../../api/types";

export function markdownBlocks(body: string): string[] {
  return body.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
}

/** Applied IDs are server-validated. Original QA stays visible on the full package. */
export function renderableImages(value: ApiGeneratedImagePackage | null | undefined): ApiGeneratedImagePackage | null {
  if (!value || value.status === "queued" || !value.technicalQualityPassed) return null;
  const ids = value.appliedAssetIds ?? (value.status === "ready" && value.visualQualityPassed ? value.assets?.map(asset => asset.id) : []);
  const assets = value.assets?.filter(asset => ids?.includes(asset.id)) ?? [];
  return assets.length ? { ...value, assets } : null;
}
