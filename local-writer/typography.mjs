// Executed in a browser DOM, on our own generated HTML only. Do not change the
// manuscript text, links, emphasis, image order or compliance information.
export function readableBlocks(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const quote of doc.querySelectorAll("blockquote")) {
    const block = doc.createElement("div");
    block.append(...quote.childNodes);
    quote.replaceWith(block);
  }
  for (const node of doc.querySelectorAll("p,li,td,th,h1,h2,h3,h4,div")) {
    const heading = /^H[1-4]$/.test(node.tagName);
    const size = heading ? (node.tagName === "H1" || node.tagName === "H2" ? 22 : 19) : 17;
    node.style.cssText = `font-family:Arial,'Malgun Gothic',sans-serif;font-size:${size}px;line-height:1.9;text-align:left;font-style:normal;color:#202124;margin:0 0 18px;word-break:keep-all;overflow-wrap:break-word;`;
    if (heading) node.style.fontWeight = "700";
    if (node.querySelector("p,ul,ol,table,div")) continue;
    // SmartEditor may ignore a block font size while accepting inline text size.
    const span = doc.createElement("span");
    span.style.cssText = `font-size:${size}px;font-family:Arial,'Malgun Gothic',sans-serif;line-height:1.9;`;
    span.append(...node.childNodes);
    node.append(span);
  }
  for (const table of doc.querySelectorAll("table")) table.style.cssText = "width:100%;border-collapse:collapse;";
  for (const cell of doc.querySelectorAll("td,th")) { cell.style.border = "1px solid #ddd"; cell.style.padding = "10px"; }
  return [...doc.body.children].map(node => ({ html: node.outerHTML, text: node.textContent ?? "" }));
}

// Deliberate reading/typing pace, not an attempt to conceal automation.
export function paragraphPause(text) {
  return Math.min(20_000, Math.max(1200, Array.from(text).length * 100));
}
