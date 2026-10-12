import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { COMPLIANCE_IMAGE_PATH, COMPLIANCE_IMAGE_SHA256 } from "../../shared/compliance-footer.js";

// Vite copies public assets into dist, also copied into the Cloud Run image.
// The public fallback supports source-mode tests/dev without a prior web build.
export async function loadComplianceImage(): Promise<{ body: Buffer; contentType: string }> {
  let body: Buffer;
  try { body = await readFile(path.resolve(`dist${COMPLIANCE_IMAGE_PATH}`)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    body = await readFile(path.resolve(`public${COMPLIANCE_IMAGE_PATH}`));
  }
  if (createHash("sha256").update(body).digest("hex") !== COMPLIANCE_IMAGE_SHA256) {
    throw new Error("필수 안내 이미지가 원본과 일치하지 않습니다.");
  }
  return { body, contentType: "image/jpeg" };
}
