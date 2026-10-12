// Operator-supplied disclosure, not an AI-generated image. Applies at every
// output boundary, including legacy drafts; never send it through generation QA.
export const COMPLIANCE_IMAGE_PATH = "/compliance/insurance-notice-20261012.jpg";
export const COMPLIANCE_IMAGE_ID = "compliance-notice-20261012";
export const COMPLIANCE_IMAGE_SHA256 = "27afcf3646fa6168bc8badcb2c6d0b059b8859db60cc09dded2929b19bfcd049";
export const COMPLIANCE_IMAGE_ALT = "가입 시 알아두실 사항";
export const DEFAULT_APPROVAL_NUMBER = "확인필-제2026-자동차CM사업부-블로그00000E-전사(26.00.00~27.00.00)";

export function validApprovalNumber(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200
    && !/[<>\u0000-\u001f\u007f]/u.test(value);
}

export function approvalNumber(value: unknown): string {
  return validApprovalNumber(value) ? value.trim() : DEFAULT_APPROVAL_NUMBER;
}

export function complianceFooterHtml(number: unknown, imageUrl: string): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return `<section data-compliance-footer="true" style="margin-top:32px"><img src="${escape(imageUrl)}" alt="${COMPLIANCE_IMAGE_ALT}" style="display:block;width:100%;height:auto;border:0"><p style="margin:12px 0 0;font-size:13px;line-height:1.7;overflow-wrap:anywhere">${escape(approvalNumber(number))}</p></section>`;
}
