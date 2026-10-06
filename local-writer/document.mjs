import { createHash } from "node:crypto";
import { Marked } from "marked";

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Keep this local: the Windows helper must also disclose old queued payloads.
export function generatedImageCaption(altText = "") {
  const disclosure = "AI로 생성한 이미지입니다.";
  const description = String(altText).trim();
  return description.includes(disclosure) ? description
    : [description, disclosure].filter(Boolean).join(" · ");
}
export function compactOrder(items) {
  const result = [];
  for (const item of items) {
    if (item.kind === "image") { result.push({ kind: "image" }); continue; }
    const text = item.text.replace(/\s+/g, "").normalize("NFC");
    if (!text) continue;
    if (result.at(-1)?.kind === "text") result.at(-1).text += text;
    else result.push({ kind: "text", text });
  }
  return result;
}
export function assertDocumentOrder(expected, actual) {
  if (JSON.stringify(compactOrder(expected)) !== JSON.stringify(compactOrder(actual))) {
    throw new Error("네이버 본문의 문장 또는 이미지 위치가 원본과 다릅니다. 열린 편집기를 확인해주세요.");
  }
}
const markdown = new Marked({ async: false, gfm: true, breaks: true });
markdown.use({ renderer: {
  html: ({ text }) => escapeHtml(text),
  image: ({ text }) => escapeHtml(text), // Only server-approved manifest images.
  link({ href, text, tokens }) {
    const label = tokens ? this.parser.parseInline(tokens) : escapeHtml(text);
    return /^https?:\/\//i.test(href) ? `<a href="${escapeHtml(href)}">${label}</a>` : label;
  },
} });

export function validateTransfer(payload) {
  if (payload?.schemaVersion !== 1 || typeof payload.title !== "string" || typeof payload.body !== "string"
    || !Array.isArray(payload.assets) || !payload.assets.length || payload.assets.length > 3) throw new Error("원고 전송 형식이 올바르지 않습니다.");
  for (const asset of payload.assets) {
    if (!/^[a-z0-9-]+$/.test(asset.id) || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || !["hero", "inline"].includes(asset.role) || !Number.isInteger(asset.afterSection)) throw new Error("이미지 정보가 올바르지 않습니다.");
  }
  const { fingerprint, ...data } = payload;
  if (createHash("sha256").update(JSON.stringify(data)).digest("hex") !== fingerprint) throw new Error("원고 전송 중 내용이 변경되었습니다.");
}

/** Same section positioning as the dashboard, independent from stale HTML.
 * Source URLs, disclaimer, summary and FAQ are ordinary markdown: none is cut.
 * Unknown/orphan image positions stop transfer rather than silently drop files. */
export function transferPlan(payload) {
  validateTransfer(payload);
  const plan = [];
  const emitted = new Set();
  const addImages = (role, index) => {
    for (const asset of payload.assets.filter(a => a.role === role && (role === "hero" || a.afterSection === index))) {
      if (emitted.has(asset.id)) throw new Error("중복 이미지가 있습니다.");
      emitted.add(asset.id); plan.push({ kind: "image", asset });
    }
  };
  addImages("hero", 0);
  let section = 0;
  let first = true;
  let pending = [];
  const flush = () => {
    if (pending.length) plan.push({ kind: "html", html: markdown.parse(pending.join("\n\n")) });
    pending = [];
  };
  for (const block of payload.body.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text) continue;
    if (first && text === `# ${payload.title}`) { first = false; continue; }
    first = false;
    if (text.startsWith("## ")) {
      flush(); if (section > 0) addImages("inline", section);
      section++;
    }
    pending.push(block);
  }
  flush(); addImages("inline", section);
  if (emitted.size !== payload.assets.length) throw new Error("본문 절과 이미지 위치가 맞지 않습니다. 원고의 이미지 위치를 확인해주세요.");
  return plan;
}

export function previewHtml(payload, plan) {
  const body = plan.map(item => item.kind === "html" ? item.html
    : `<figure><img src="${escapeHtml(item.asset.id)}.jpg" alt="${escapeHtml(item.asset.altText)}"><figcaption>${escapeHtml(generatedImageCaption(item.asset.altText))}</figcaption></figure>`).join("\n");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(payload.title)}</title><style>body{font:17px/1.9 system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 20px;color:#20242a}img{max-width:100%;height:auto}figure{margin:24px 0}figcaption{font-size:13px;color:#69727b}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}pre{white-space:pre-wrap}a{overflow-wrap:anywhere}</style>
  <body><p>전송 원본 미리보기 · 네이버 편집기에서 서식이 일부 달라질 수 있습니다. 실제 발행은 하지 않습니다.</p><h1>${escapeHtml(payload.title)}</h1>${body}</body></html>`;
}
