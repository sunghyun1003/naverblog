import { createHash } from "node:crypto";
import {
  AlignmentType, Document, ExternalHyperlink, Footer, HeadingLevel, ImageRun,
  LevelFormat, Packer, PageNumber, Paragraph, Table, TableCell, TableLayoutType,
  TableRow, TextRun, WidthType, type IRunOptions, type INumberingOptions,
} from "docx";
import { imageSize } from "image-size";
import { Lexer, type MarkedToken, type Token } from "marked";
import { z } from "zod";
import { DomainError } from "../domain/errors.js";
import type { ContentDetail } from "../domain/types.js";

export const WORD_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const disclosure = "AI로 생성한 이미지입니다.";
const assetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), role: z.enum(["hero", "inline"]),
  afterSection: z.number().int().nonnegative(), altText: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const imagePackageSchema = z.object({
  status: z.string(), technicalQualityPassed: z.boolean().optional(), visualQualityPassed: z.boolean().optional(),
  appliedAssetIds: z.array(z.string()).max(3).optional(), assets: z.array(assetSchema).max(3).optional(),
});
type Asset = z.infer<typeof assetSchema>;
type Block = Paragraph | Table;
type Inline = TextRun | ExternalHyperlink;
export type WordImageLoader = (contentId: string, assetId: string) => Promise<{ body: Buffer; contentType: string }>;

function unavailable(message: string, code = "WORD_EXPORT_UNAVAILABLE"): never {
  throw new DomainError(code, message, 409);
}

/** Exact saved copy only. No model calls, stale HTML packages, or remote image URLs. */
export async function exportContentWord(
  detail: ContentDetail & { freshness?: { stale?: boolean } },
  expected: { versionId: string; updatedAt: string },
  loadImage: WordImageLoader,
) {
  const version = detail.versions.at(-1);
  if (detail.content.state === "deleted") unavailable("삭제된 원고는 내려받을 수 없습니다.");
  if (!version?.body.trim() || !version.title.trim()) unavailable("저장된 제목과 원고 본문이 있어야 Word 파일을 만들 수 있습니다.");
  if (detail.freshness?.stale || version.id !== expected.versionId || detail.content.updatedAt !== expected.updatedAt) {
    unavailable("원고가 변경됐거나 최신 상태를 확인하지 못했습니다. 새로고침 후 다시 내려받아주세요.", "WORD_EXPORT_STALE");
  }
  if (detail.content.rewriteStatus === "queued" || detail.content.imageGenerationStatus === "queued") {
    unavailable("원고 또는 이미지 작업 중입니다. 작업이 끝난 뒤 내려받아주세요.");
  }
  if (version.body.length > 100_000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(version.title + version.body)) {
    unavailable("본문 길이 또는 특수 제어문자를 확인해주세요. 원고를 생략한 파일은 만들지 않습니다.");
  }
  let assets: Asset[] = [];
  let excludedImageCount = 0;
  const rawPackage = version.metadata.imagePackage;
  if (rawPackage != null) {
    const parsed = imagePackageSchema.safeParse(rawPackage);
    if (!parsed.success) unavailable("이미지 정보를 읽지 못했습니다. 원고를 새로고침한 뒤 다시 시도해주세요.");
    const pkg = parsed.data;
    if (pkg.status === "queued") unavailable("이미지 작업 중입니다. 작업이 끝난 뒤 내려받아주세요.");
    const all = pkg.assets ?? [];
    const ids = pkg.appliedAssetIds ?? (pkg.status === "ready" && pkg.visualQualityPassed && pkg.technicalQualityPassed ? all.map(a => a.id) : []);
    assets = all.filter(a => ids.includes(a.id));
    if (assets.length !== ids.length || new Set(ids).size !== ids.length || (assets.length && !pkg.technicalQualityPassed)) {
      unavailable("본문에 적용된 이미지 정보를 확인하지 못했습니다. 이미지 탭에서 적용 상태를 확인해주세요.");
    }
    excludedImageCount = all.length - assets.length;
  }

  const images = await Promise.all(assets.map(async asset => {
    try {
      const image = await loadImage(detail.content.id, asset.id);
      if (image.body.length > 15 * 1024 * 1024 || createHash("sha256").update(image.body).digest("hex") !== asset.sha256) {
        throw new Error("Image changed or exceeds size limit");
      }
      const size = imageSize(image.body);
      if (!size.width || !size.height || !["png", "jpg"].includes(size.type ?? "")) throw new Error("Unsupported image");
      const scale = Math.min(624 / size.width, 440 / size.height, 1);
      return { asset, body: image.body, type: size.type as "png" | "jpg", width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
    } catch {
      unavailable(`‘${asset.altText || asset.id}’ 이미지 파일을 확인하지 못했습니다. 이미지가 빠진 Word 파일은 만들지 않습니다. 새로고침 후 다시 시도해주세요.`, "WORD_IMAGE_UNAVAILABLE");
    }
  }));
  if (images.reduce((total, item) => total + item.body.length, 0) > 25 * 1024 * 1024) {
    unavailable("적용 이미지의 합계 용량이 25MB를 넘습니다. 이미지 용량을 줄인 뒤 다시 내려받아주세요.");
  }

  const numbering: INumberingOptions["config"][number][] = [];
  const literal = (text: string, style: IRunOptions = {}) => text.split("\n").map((line, index) => new TextRun({ ...style, text: line, ...(index ? { break: 1 } : {}) }));
  function inline(tokens: Token[], style: IRunOptions = {}): Inline[] {
    return tokens.flatMap((raw): Inline[] => {
      const token = raw as MarkedToken; // No custom Marked extensions are registered.
      switch (token.type) {
        case "strong": return inline(token.tokens, { ...style, bold: true });
        case "em": return inline(token.tokens, { ...style, italics: true });
        case "del": return inline(token.tokens, { ...style, strike: true });
        case "br": return [new TextRun({ ...style, break: 1 })];
        case "link": {
          if (!/^(https?:\/\/|mailto:)/i.test(token.href)) return inline(token.tokens, style);
          return [new ExternalHyperlink({ link: token.href, children: inline(token.tokens, style).filter((run): run is TextRun => run instanceof TextRun) })];
        }
        case "image": unavailable("본문에 직접 붙인 외부 이미지가 있습니다. 이미지 탭의 본문 적용 기능을 사용한 뒤 내려받아주세요.", "WORD_EXTERNAL_IMAGE");
        case "text": return token.tokens ? inline(token.tokens, style) : literal(token.text, style);
        case "escape": case "codespan": return literal(token.text, style);
        case "html": {
          if (/^<br\s*\/?\s*>$/i.test(token.raw)) return [new TextRun({ ...style, break: 1 })];
          if (/<img\b/i.test(token.raw)) unavailable("본문의 외부 이미지는 Word에 포함할 수 없습니다. 이미지 탭에서 본문에 적용해주세요.", "WORD_EXTERNAL_IMAGE");
          return literal(token.raw, style);
        }
        default: return [new TextRun({ ...style, text: token.raw })];
      }
    });
  }
  const textRuns = (text: string) => inline(Lexer.lexInline(text));
  function blocks(tokens: Token[], depth = 0): Block[] {
    return tokens.flatMap((raw): Block[] => {
      const token = raw as MarkedToken;
      switch (token.type) {
        case "space": return [];
        case "heading": return [new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.min(token.depth - 1, 2)]!, children: inline(token.tokens), keepNext: true })];
        case "paragraph": case "text": return [new Paragraph({ children: token.tokens ? inline(token.tokens) : textRuns(token.text) })];
        case "blockquote": return blocks(token.tokens, depth);
        case "list": {
          const reference = `list-${numbering.length}`;
          numbering.push({ reference, levels: [{ level: 0, format: token.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
            text: token.ordered ? "%1." : "•", start: typeof token.start === "number" ? token.start : 1,
            alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 * (depth + 1), hanging: 220 } } } }] });
          return token.items.flatMap(item => {
            const children: Block[] = [];
            let first = true;
            for (const child of item.tokens) {
              if (first && (child.type === "text" || child.type === "paragraph")) {
                children.push(new Paragraph({ numbering: { reference, level: 0 }, children: [
                  ...(item.task ? [new TextRun(item.checked ? "☑ " : "☐ ")] : []),
                  ...inline(child.tokens ?? Lexer.lexInline(child.text)),
                ] }));
                first = false;
              } else children.push(...blocks([child], depth + 1));
            }
            return children;
          });
        }
        case "table": {
          const rows = [token.header, ...token.rows];
          const columns = token.header.length;
          return [new Table({ width: { size: 9360, type: WidthType.DXA }, layout: TableLayoutType.FIXED,
            columnWidths: Array.from({ length: columns }, () => Math.floor(9360 / columns)),
            rows: rows.map((cells, row) => new TableRow({ tableHeader: row === 0, children: cells.map(cell => new TableCell({
              width: { size: Math.floor(9360 / columns), type: WidthType.DXA },
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [new Paragraph({ children: inline(cell.tokens, { bold: row === 0 }), spacing: { after: 60 } })],
            })) })) }), new Paragraph({ spacing: { after: 100 } })];
        }
        case "code": return [new Paragraph({ children: token.text.split("\n").flatMap((line, index) => [new TextRun({ text: line, ...(index ? { break: 1 } : {}) })]) })];
        case "hr": return [new Paragraph({ border: { bottom: { color: "D9D9D9", size: 4, style: "single" } } })];
        case "html": {
          if (/<img\b/i.test(token.raw)) unavailable("본문의 외부 이미지는 Word에 포함할 수 없습니다. 이미지 탭에서 본문에 적용해주세요.", "WORD_EXTERNAL_IMAGE");
          return [new Paragraph({ children: literal(token.raw) })];
        }
        default: return [new Paragraph({ children: [new TextRun(token.raw)] })];
      }
    });
  }

  const children: Block[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: textRuns(version.title), keepNext: true })];
  const inserted = new Set<string>();
  const addImages = (predicate: (asset: Asset) => boolean) => {
    for (const image of images.filter(item => predicate(item.asset) && !inserted.has(item.asset.id))) {
      inserted.add(image.asset.id);
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new ImageRun({
        type: image.type, data: image.body, transformation: { width: image.width, height: image.height },
        altText: { name: image.asset.id, title: image.asset.altText, description: image.asset.altText },
      })] }));
      const caption = image.asset.altText.includes(disclosure) ? image.asset.altText : [image.asset.altText.trim(), disclosure].filter(Boolean).join(" · ");
      children.push(new Paragraph({ style: "Caption", children: [new TextRun(caption)] }));
    }
  };
  addImages(asset => asset.role === "hero");
  let section = 0;
  const tokens = Lexer.lex(version.body.replace(/\r\n/g, "\n"), { gfm: true });
  const firstContent = tokens.find(token => token.type !== "space");
  for (const token of tokens) {
    // A stored Markdown title is not a second article title. Other H1s are retained.
    if (token === firstContent && token.type === "heading" && token.depth === 1 && token.text.trim() === version.title.trim()) continue;
    if (token.type === "heading" && token.depth === 2) {
      addImages(asset => asset.role === "inline" && asset.afterSection <= section);
      section += 1;
    }
    children.push(...blocks([token]));
  }
  // Missing/renamed sections must never silently drop an applied image.
  addImages(() => true);
  const font = { ascii: "Malgun Gothic", hAnsi: "Malgun Gothic", eastAsia: "맑은 고딕", cs: "Malgun Gothic" };
  const document = new Document({
    title: version.title, creator: "블로그 운영센터", description: `원고 ${detail.content.id} · 버전 ${version.id}`,
    styles: { default: {
      document: { run: { font, size: 22, color: "000000", language: { value: "ko-KR", eastAsia: "ko-KR" } }, paragraph: { spacing: { after: 160, line: 320 } } },
      title: { run: { font, size: 36, bold: true, color: "000000" }, paragraph: { spacing: { after: 260 } } },
      heading1: { run: { font, size: 30, bold: true, color: "000000" }, paragraph: { spacing: { before: 260, after: 140 } } },
      heading2: { run: { font, size: 26, bold: true, color: "000000" }, paragraph: { spacing: { before: 220, after: 120 } } },
      heading3: { run: { font, size: 24, bold: true, color: "000000" } },
    }, paragraphStyles: [{ id: "Caption", name: "Caption", basedOn: "Normal", run: { size: 18, color: "555555" }, paragraph: { spacing: { after: 200 }, alignment: AlignmentType.CENTER } }] },
    numbering: { config: numbering },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })] })] }) } }],
  });
  const filenameTitle = Array.from(version.title.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/[. ]+$/g, "")).slice(0, 90).join("") || "블로그 원고";
  return { body: await Packer.toBuffer(document), filename: `${filenameTitle}.docx`, imageCount: images.length, excludedImageCount };
}
