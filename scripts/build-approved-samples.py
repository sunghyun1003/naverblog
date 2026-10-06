"""Extract user-approved DOCX copy without Word, credentials, or AI calls.

Keeps paragraph order (including tables), hyperlinks and source hashes.
The source files are read-only. Output is a reproducible UTF-8 JSON corpus.
"""
import argparse
import email
from email import policy
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


class Node:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self):
        return re.sub(r"\s+", " ", "".join(
            child.text() + (" " if child.tag in {"p", "li", "td", "th", "br", "div"} else "")
            if isinstance(child, Node) else child for child in self.children)).strip()


class HTMLTree(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def html_article(html):
    root = HTMLTree(html).root
    nodes = list(root.walk())
    find_id = lambda value: next((n for n in nodes if n.attrs.get("id") == value), None)
    title = next((n.text() for n in nodes if n.tag == "h1"), "")
    core = find_id("nxt_usp-summary")
    body = find_id("nxt_blog-content")
    if body is None:
        raise ValueError("Approved HTML sample is missing its article body")
    # FAQ can be a sibling of article. Remove website chrome, not article text.
    paragraphs = []

    def blocks(node):
        if node.tag in {"script", "style", "nav", "button"} or node.attrs.get("id") in {
            "nxt_page-toc", "nxt_usp-summary"} or "contBanner" in node.attrs.get("class", ""):
            return
        if node.tag in {"h2", "h3", "h4", "p", "li", "tr", "dt", "dd"}:
            text = node.text()
            if text:
                paragraphs.append({"text": text, "style": node.tag})
            return
        # Some website FAQ answers and callouts use divs with inline spans,
        # not paragraphs. Keep those once, without duplicating their parents.
        if node.tag == "div" and not any(n is not node and n.tag in {
                "div", "section", "p", "h2", "h3", "h4", "ul", "ol", "table"
        } for n in node.walk()):
            if node.text():
                paragraphs.append({"text": node.text(), "style": "p"})
            return
        for child in node.children:
            if isinstance(child, Node):
                blocks(child)

    blocks(body)
    faq = find_id("faqAccordion")
    if faq is not None and faq not in list(body.walk()):
        blocks(faq)
    links = [n.attrs["href"] for n in body.walk() if n.tag == "a" and re.match(r"^https?://", n.attrs.get("href", ""))]
    category = next((n.text().lstrip("#") for n in nodes if n.tag == "a" and n.attrs.get("href", "").startswith("/category")), "")
    date = next((n.text() for n in nodes if "regcntbox" in n.attrs.get("class", "")), "")
    date_match = re.search(r"\d{4}\.\s*\d{2}\.\s*\d{2}", date)
    return {"title": title, "category": category,
            "sourceDate": re.sub(r"\.\s*", "-", date_match[0]) if date_match else "",
            "corePoints": [n.text() for n in core.walk() if n.tag == "li"] if core else [],
            "paragraphs": paragraphs, "links": list(dict.fromkeys(links))}


def extract(file):
    with zipfile.ZipFile(file) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        chunks = [name for name in archive.namelist() if name.startswith("word/") and name.endswith((".mht", ".mhtml"))]
        if chunks:
            message = email.message_from_bytes(archive.read(chunks[0]), policy=policy.default)
            html = next(part.get_content() for part in message.walk() if part.get_content_type() == "text/html")
            article = html_article(html)
            return {"id": hashlib.sha256(file.name.encode()).hexdigest()[:12], "file": file.name,
                    "sha256": hashlib.sha256(file.read_bytes()).hexdigest(), **article}
        paragraphs = []
        for paragraph in document.findall(".//w:body//w:p", NS):
            text = "".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()
            if not text:
                continue
            style_node = paragraph.find("w:pPr/w:pStyle", NS)
            style = style_node.get(f"{{{NS['w']}}}val", "") if style_node is not None else ""
            heading = re.search(r"(?:heading|제목)\s*([1-6])", style, re.I)
            paragraphs.append({"text": text, "style": f"h{heading[1]}" if heading else "p"})
        links = []
        rels = "word/_rels/document.xml.rels"
        if rels in archive.namelist():
            for node in ET.fromstring(archive.read(rels)):
                target = node.get("Target", "")
                if node.get("Type", "").endswith("/hyperlink") and re.match(r"^https?://", target):
                    links.append(target)
    return {"id": hashlib.sha256(file.name.encode()).hexdigest()[:12], "file": file.name,
            "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "title": paragraphs[0]["text"] if paragraphs else file.stem,
            "category": "", "sourceDate": "", "corePoints": [],
            "paragraphs": paragraphs, "links": list(dict.fromkeys(links))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=Path, default=Path("samples"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    files = sorted(args.samples.glob("*.docx"), key=lambda p: p.name)
    if not files:
        raise SystemExit("No DOCX samples found")
    articles = [extract(file) for file in files]
    if any(not item["paragraphs"] for item in articles):
        raise SystemExit("Empty sample extraction")
    corpus = {"schemaVersion": 1, "approvalBasis": "User identified these as reviewed and published brand articles; new outputs are not automatically approved.",
              "revision": hashlib.sha256("\n".join(a["sha256"] for a in articles).encode()).hexdigest(),
              "articles": articles}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {len(articles)} approved samples")


if __name__ == "__main__":
    main()
