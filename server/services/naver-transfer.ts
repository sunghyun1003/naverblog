import { createHash } from "node:crypto";
import { z } from "zod";
import type { ContentDetail } from "../domain/types.js";
import { DomainError } from "../domain/errors.js";
import { approvalNumber, COMPLIANCE_IMAGE_ID, COMPLIANCE_IMAGE_SHA256, COMPLIANCE_IMAGE_ALT } from "../../shared/compliance-footer.js";

const assetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), role: z.enum(["hero", "inline"]),
  afterSection: z.number().int().nonnegative(), altText: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type TransferAsset = Omit<z.infer<typeof assetSchema>, "role"> & { role: "hero" | "inline" | "footer" };
export interface NaverTransfer {
  schemaVersion: 2;
  approvalNumber: string;
  contentId: string;
  versionId: string;
  title: string;
  body: string;
  assets: TransferAsset[];
  fingerprint: string;
}

/** Snapshot the same latest markdown and applied images the dashboard renders.
 * Never regenerate, use stale copy-package.html, or silently omit images. */
export function naverTransfer(detail: ContentDetail): NaverTransfer {
  const version = detail.versions.at(-1);
  if (!version || !["approved", "review_ready", "scheduled", "published", "measured"].includes(detail.content.state)
    || detail.content.rewriteStatus === "queued" || detail.content.imageGenerationStatus === "queued") {
    throw new DomainError("DRAFT_NOT_COMPLETE", "이미지까지 완성된 원고만 보낼 수 있습니다.", 409);
  }
  const parsed = z.object({
    status: z.enum(["ready", "failed"]), technicalQualityPassed: z.literal(true),
    visualQualityPassed: z.boolean().optional(), appliedAssetIds: z.array(z.string()).optional(),
    assets: z.array(assetSchema).min(1).max(3),
  }).safeParse(version.metadata.imagePackage);
  if (!parsed.success) throw new DomainError("DRAFT_IMAGES_MISSING", "본문에 적용된 이미지 정보를 확인해주세요.", 409);
  const pkg = parsed.data;
  const selected = pkg.appliedAssetIds ?? (pkg.status === "ready" && pkg.visualQualityPassed ? pkg.assets.map(a => a.id) : []);
  const assets = pkg.assets.filter(a => selected.includes(a.id));
  if (!assets.length || assets.length !== new Set(selected).size) {
    throw new DomainError("DRAFT_IMAGES_MISSING", "본문에 적용된 이미지를 확인해주세요.", 409);
  }
  const title = version.title;
  const body = version.body;
  if (!title.trim() || body.trim().length < 20 || body.length > 100_000) throw new DomainError("DRAFT_EMPTY", "원고 본문을 확인해주세요.", 409);
  const footer: TransferAsset = { id: COMPLIANCE_IMAGE_ID, role: "footer", afterSection: 0, altText: COMPLIANCE_IMAGE_ALT, sha256: COMPLIANCE_IMAGE_SHA256 };
  // V2 fails safely on an older PC helper instead of silently missing the footer.
  const payload = { schemaVersion: 2 as const, contentId: detail.content.id, versionId: version.id, title, body,
    assets: [...assets, footer], approvalNumber: approvalNumber(version.metadata.approvalNumber) };
  return { ...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}
