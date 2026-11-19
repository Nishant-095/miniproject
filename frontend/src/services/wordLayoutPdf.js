import { PDFDocument, rgb, setCharacterSqueeze } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { renderAsync } from "docx-preview";
import html2canvasUrl from "html2canvas/dist/html2canvas.min.js?url";
import { MAX_PDF_PAGES } from "../utils/files.js";
import { readDocxArchive, prepareDocxLayout } from "./docxLayout.js";
import { paginateWordPages } from "./docxPagination.js";
import { wordFontCss } from "./wordFonts.js";

const frameCss = `
  html, body { margin: 0; padding: 0; color: #000; background: #fff; color-scheme: light; }
  body { font-family: "Calibri", "Arial", sans-serif; font-size: 11pt; }
  section.uh-word { background: #fff; box-shadow: none; margin: 0; flex-shrink: 0; }
  section.uh-word > article { flex-shrink: 0; }
  .uh-word, .uh-word * { letter-spacing: normal; }
  .uh-word a { pointer-events: none; }
  .uh-page-border { position: absolute; pointer-events: none; z-index: 0; box-sizing: border-box; }
`;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
function cancelled(options) {
  if (options.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
}
async function createFrame() {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
  frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;left:-100000px;top:0;width:1400px;height:1600px;border:0;pointer-events:none;";
  const ready = new Promise((resolve, reject) => {
    frame.onload = resolve; frame.onerror = () => reject(new Error("The local Word renderer could not start."));
  });
  const nonce = crypto.randomUUID();
  frame.srcdoc = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; img-src data: blob:; font-src 'self' data: blob: ${location.origin}; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"></head><body></body></html>`;
  document.body.appendChild(frame);
  try {
    await ready;
    // Run capture in the same isolated document: app CSS must not affect font metrics.
    const script = frame.contentDocument.createElement("script"); script.nonce = nonce; script.src = html2canvasUrl;
    await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = () => reject(new Error("The offline page renderer is missing. Open the app once while connected.")); frame.contentDocument.head.appendChild(script); });
    return frame;
  } catch (error) { frame.remove(); throw error; }
}
export function applyParagraphProperties(container, metadata) {
  for (const anchor of container.querySelectorAll('[id^="uh_para_"]')) {
    const properties = metadata.paragraphs.get(anchor.id), p = anchor.closest("p");
    if (!properties || !p) continue;
    anchor.style.display = "none";
    if (properties.size) { p.style.fontSize = `${properties.size}pt`; p.style.minHeight = `${properties.size}pt`; }
    if (properties.family) p.style.fontFamily = `"${properties.family.replace(/["\\]/g, "")}"`;
    if (properties.keepNext) p.dataset.keepNext = "true";
    for (const border of properties.borders || []) {
      if (!["top", "right", "bottom", "left"].includes(border.side) || ["nil", "none"].includes(border.style)) continue;
      const side = border.side[0].toUpperCase() + border.side.slice(1);
      const style = border.style === "double" ? "double" : /dash/i.test(border.style) ? "dashed" : border.style === "dotted" ? "dotted" : "solid";
      const color = /^[0-9a-f]{6}$/i.test(border.color || "") ? `#${border.color}` : "#000";
      p.style[`border${side}`] = `${border.size * (style === "double" ? 3 : 1)}pt ${style} ${color}`;
      p.style[`padding${side}`] = `${border.space}pt`;
    }
    if (properties.rule) {
      const svg = [...p.querySelectorAll("svg")].find(item => parseFloat(item.style.width) === 0);
      const rule = p.ownerDocument.createElement("div");
      const color = /^#[0-9a-f]{6}$/i.test(properties.rule.color) ? properties.rule.color : "#a0a0a0";
      rule.style.cssText = `display:block;width:100%;height:${Number(properties.rule.height)}pt;min-height:0;font-size:0;line-height:0;background:${color};`;
      if (svg) svg.parentElement.replaceWith(rule); else p.appendChild(rule);
      if (!p.textContent.trim()) { p.replaceChildren(rule); p.dataset.wordRule = "true"; }
    }
  }
}
function applyWordLineHeights(container) {
  const doc = container.ownerDocument, win = doc.defaultView;
  for (const p of container.querySelectorAll("p")) {
    const css = win.getComputedStyle(p);
    // Word's automatic line spacing scales the font's natural line box, not its em.
    if (p.style.lineHeight && /(?:pt|px)$/.test(p.style.lineHeight)) continue;
    const ratio = parseFloat(css.lineHeight) / parseFloat(css.fontSize);
    if (!Number.isFinite(ratio)) continue;
    const probe = p.cloneNode(false); probe.removeAttribute("id");
    probe.style.cssText += ";position:absolute;visibility:hidden;margin:0;padding:0;min-height:0;height:auto;line-height:normal;";
    probe.textContent = "Ag"; p.parentElement.appendChild(probe);
    const height = probe.getBoundingClientRect().height * ratio; probe.remove();
    p.style.lineHeight = `${height}px`;
    if (!p.textContent.trim()) p.style.minHeight = `${height}px`;
    if (p.dataset.wordRule) { p.style.display = "flex"; p.style.alignItems = "center"; }
  }
}
function pageSection(page, metadata, previous) {
  const marker = page.querySelector('[id^="uh_para_"]');
  return metadata.paragraphs.get(marker?.id)?.section ?? previous;
}
function drawPageBorders(page, borders) {
  if (!borders?.sides.length) return;
  const { width, height } = page.getSize(), insets = { top: 24, right: 24, bottom: 24, left: 24 };
  borders.sides.forEach(row => { insets[row.side] = borders.offset === "page" ? row.space : Math.max(0, row.margin - row.space); });
  for (const row of borders.sides) {
    const hex = /^[0-9a-f]{6}$/i.test(row.color || "") ? row.color : "000000";
    const color = rgb(...[0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255));
    for (const extra of row.style === "double" ? [0, row.size * 2] : [0]) {
      const x1 = insets.left + extra, x2 = width - insets.right - extra;
      const y1 = height - insets.top - extra, y2 = insets.bottom + extra;
      const points = { top: [[x1,y1],[x2,y1]], bottom: [[x1,y2],[x2,y2]], left: [[x1,y1],[x1,y2]], right: [[x2,y1],[x2,y2]] }[row.side];
      page.drawLine({ start: {x:points[0][0],y:points[0][1]}, end: {x:points[1][0],y:points[1][1]}, thickness: row.size, color,
        ...( /dash/i.test(row.style) ? {dashArray:[3,2]} : row.style === "dotted" ? {dashArray:[1,2]} : {} ) });
    }
  }
}
async function waitForAssets(doc) {
  await doc.fonts.ready;
  for (const image of doc.images) {
    if (!/^(data:|blob:)/.test(image.src)) throw new Error("A Word picture is linked instead of embedded. Embed it in Word before converting.");
    if (image.src.startsWith("data:application/octet-stream;base64,")) {
      const payload = image.src.split(",")[1], header = atob(payload.slice(0, 160));
      const mime = header.startsWith("\x89PNG") ? "image/png" : header.startsWith("\xff\xd8") ? "image/jpeg" : header.startsWith("GIF8") ? "image/gif" : header.startsWith("RIFF") && header.slice(8,12) === "WEBP" ? "image/webp" : header.startsWith("BM") ? "image/bmp" : /<svg[\s>]/i.test(header) ? "image/svg+xml" : null;
      if (!mime) throw new Error("A Word picture uses an unsupported format. Replace it with an embedded JPG or PNG in Word.");
      // docx-preview labels images as binary data; capture requires an image MIME type.
      image.src = `data:${mime};base64,${payload}`;
    }
    try { await image.decode(); } catch { throw new Error("A Word picture could not be rendered. Use an embedded JPG or PNG picture."); }
  }
  await doc.fonts.ready;
}
function textOnPage(element) {
  const doc = element.ownerDocument, rect = element.getBoundingClientRect(), walker = doc.createTreeWalker(element, 4);
  const words = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement || node.parentElement.closest("style, script, .uh-page-border")) continue;
    for (const match of node.textContent.matchAll(/\S+/g)) {
      const range = doc.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
      const boxes = [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0);
      if (boxes.length !== 1) continue;
      const box = boxes[0];
      if (box.bottom < rect.top || box.top > rect.bottom) continue;
      words.push({ text: match[0], x: box.left - rect.left, top: box.top - rect.top, width: box.width, height: box.height });
    }
  }
  return words;
}

// Keep the rendered page appearance and add a text layer for search and copying.
export async function renderDocxPdf(file, options = {}) {
  cancelled(options);
  const metadata = prepareDocxLayout(readDocxArchive(new Uint8Array(await file.arrayBuffer())));
  const frame = await createFrame();
  let canvas;
  try {
    const doc = frame.contentDocument;
    const fonts = doc.createElement("style"); fonts.textContent = wordFontCss; doc.head.appendChild(fonts);
    const styles = doc.createElement("div"), container = doc.createElement("div"); doc.body.append(styles, container);
    await renderAsync(metadata.bytes, container, styles, {
      className: "uh-word", inWrapper: false, ignoreWidth: false, ignoreHeight: false,
      ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false,
      renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true,
      renderChanges: false, renderComments: false, renderAltChunks: false,
      useBase64URL: true, experimental: true,
    });
    const base = doc.createElement("style"); base.textContent = frameCss; doc.head.appendChild(base);
    applyParagraphProperties(container, metadata);
    await waitForAssets(doc); cancelled(options);
    applyWordLineHeights(container);
    const pages = paginateWordPages(container, MAX_PDF_PAGES, () => cancelled(options));
    if (!pages.length) throw new Error("This Word document has no pages to convert.");
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
    const fontResponse = await fetch("/fonts/DejaVuSans.ttf");
    if (!fontResponse.ok) throw new Error("The local PDF font is missing. Open UtilityHub once while connected.");
    const font = await pdf.embedFont(await fontResponse.arrayBuffer(), { subset: true });
    const characters = new Set(font.getCharacterSet());
    let section = 0;
    for (const item of pages) {
      cancelled(options); section = pageSection(item.element, metadata, section);
      const words = textOnPage(item.element);
      const captureScale = Math.min(2, 5000 / Math.max(item.width, item.height));
      const target = doc.createElement("canvas");
      target.width = Math.ceil(item.width * captureScale); target.height = Math.ceil(item.height * captureScale);
      canvas = await frame.contentWindow.html2canvas(item.element, {
        canvas: target,
        backgroundColor: "#fff", scale: captureScale,
        width: Math.ceil(item.width), height: Math.ceil(item.height),
        windowWidth: 1400, windowHeight: 1600, scrollX: 0, scrollY: 0,
        allowTaint: false, useCORS: false, logging: false, imageTimeout: 20000,
      });
      cancelled(options);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .96));
      if (!blob) throw new Error("The browser could not render a Word page. Try a smaller document.");
      const image = await pdf.embedJpg(await blob.arrayBuffer());
      const scale = 72 / 96, width = item.width * scale, height = item.height * scale;
      const page = pdf.addPage([width, height]); page.drawImage(image, { x: 0, y: 0, width, height });
      drawPageBorders(page, metadata.sections[section]?.borders);
      for (const word of words) {
        const value = [...word.text].filter(char => characters.has(char.codePointAt(0))).join("");
        if (!value) continue;
        const size = Math.max(1, word.height * scale * .8), measured = font.widthOfTextAtSize(value, size);
        if (!measured) continue;
        page.pushOperators(setCharacterSqueeze(word.width * scale / measured * 100));
        page.drawText(value, { x: word.x * scale, y: height - (word.top + word.height * .8) * scale, font, size, color: rgb(0, 0, 0), opacity: 0 });
        page.pushOperators(setCharacterSqueeze(100));
      }
      canvas.width = 0; canvas.height = 0; canvas = null; item.element.remove(); await pause();
    }
    pdf.setTitle(file.name.replace(/\.docx$/i, "")); pdf.setCreator("UtilityHub local Word renderer");
    cancelled(options);
    return new Blob([await pdf.save()], { type: "application/pdf" });
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    // Remove transient file content and embedded fonts; none enter persistent storage.
    frame.remove();
  }
}
