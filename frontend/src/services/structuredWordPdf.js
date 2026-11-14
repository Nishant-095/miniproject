import { PDFDocument, StandardFonts, rgb, degrees, setCharacterSqueeze } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { unzipSync, strFromU8 } from "fflate";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const all = (node, name) => [...node.getElementsByTagNameNS("*", name)];
const first = (node, name) => node && all(node, name)[0];
const attr = (node, name) => node?.getAttributeNS(word, name) || node?.getAttribute(name);
const content = node => all(node, "t").map(item => item.textContent).join("");
function parse(bytes) {
  const xml = new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error("This Word document contains invalid XML.");
  return xml;
}

// Preserve this app's positioned text/tables when converting its Word output offline.
export async function structuredWordPdf(file) {
  let expanded = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
    expanded += entry.originalSize;
    if (expanded > 100 * 1024 * 1024) throw new Error("The expanded Word document exceeds 100 MB. Convert a smaller file.");
    return ["word/document.xml", "docProps/core.xml", "word/_rels/document.xml.rels"].includes(entry.name) || entry.name.startsWith("word/media/");
  } });
  if (!files["word/document.xml"]) throw new Error("This Word file is missing its document content.");
  const xml = parse(files["word/document.xml"]);
  const marker = files["docProps/core.xml"] && all(parse(files["docProps/core.xml"]), "keywords").some(node => node.textContent === "utilityhub-structured-pdf-v1");
  if (!marker) {
    if (all(xml, "txbxContent").length) throw new Error("This Word file uses text boxes the offline converter cannot preserve. Convert it online.");
    return null;
  }
  const sections = []; let children = [];
  for (const child of first(xml, "body").children) {
    if (child.localName === "sectPr") { sections.push({ children, properties: child }); children = []; }
    else {
      children.push(child);
      const properties = first(child, "sectPr");
      if (properties) { sections.push({ children, properties }); children = []; }
    }
  }
  if (!sections.length || children.length || sections.length > 1000) throw new Error("This Word file has an unsupported page structure or more than 1000 pages.");
  const relations = files["word/_rels/document.xml.rels"] && parse(files["word/_rels/document.xml.rels"]);
  const media = new Map(relations ? all(relations, "Relationship").map(node => [node.getAttribute("Id"), node.getAttribute("Target")]) : []);
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const fallbackResponse = await fetch("/fonts/DejaVuSans.ttf");
  if (!fallbackResponse.ok) throw new Error("The offline PDF font is missing. Open the app once while connected.");
  const unicode = await pdf.embedFont(await fallbackResponse.arrayBuffer(), { subset: true });
  const unicodeChars = new Set(unicode.getCharacterSet()), fonts = new Map();
  let page;
  async function fontFor(run, value) {
    const family = attr(first(run, "rFonts"), "ascii") || "Arial";
    const enabled = name => { const node = first(run, name); return Boolean(node) && !["false", "0", "off"].includes(attr(node, "val")); };
    const bold = enabled("b"), italic = enabled("i");
    let name = /times|serif/i.test(family) && !/sans/i.test(family) ? "TimesRoman" : /courier|mono/i.test(family) ? "Courier" : "Helvetica";
    name = name === "TimesRoman" ? bold && italic ? "TimesRomanBoldItalic" : bold ? "TimesRomanBold" : italic ? "TimesRomanItalic" : name : `${name}${bold && italic ? "BoldOblique" : bold ? "Bold" : italic ? "Oblique" : ""}`;
    if (!fonts.has(name)) fonts.set(name, await pdf.embedFont(StandardFonts[name]));
    const standard = fonts.get(name);
    try { standard.encodeText(value); return standard; }
    catch {
      if ([...value].some(character => !unicodeChars.has(character.codePointAt(0)))) throw new Error("A Word character is unsupported by the offline PDF font. Convert this document online.");
      return unicode;
    }
  }
  async function paragraph(node, x, top, rotation = 0) {
    let cursor = x, maximum = 10;
    for (const run of [...node.children].filter(child => child.localName === "r")) {
      const value = content(run); if (!value) continue;
      const font = await fontFor(run, value), size = Number(attr(first(run, "sz"), "val") || 20) / 2;
      maximum = Math.max(maximum, size);
      const fill = attr(first(run, "color"), "val") || "000000";
      const channels = /^[0-9A-F]{6}$/i.test(fill) ? fill.match(/../g).map(channel => parseInt(channel, 16) / 255) : [0, 0, 0];
      const measured = font.widthOfTextAtSize(value, size), fit = Number(attr(first(run, "fitText"), "val")) / 20;
      const squeeze = fit && measured > 0 ? fit / measured * 100 : 100;
      page.pushOperators(setCharacterSqueeze(squeeze));
      const angle = rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
      page.drawText(value, { x: x + (cursor - x) * c - size * 0.8 * s, y: page.getHeight() - top - (cursor - x) * s - size * 0.8 * c, font, size, color: rgb(...channels), rotate: degrees(-rotation) });
      page.pushOperators(setCharacterSqueeze(100)); cursor += fit || measured;
    }
    const spacing = first(node, "spacing");
    return attr(spacing, "lineRule") === "exact" ? Number(attr(spacing, "line")) / 20 : maximum * 1.2;
  }
  async function drawTable(table) {
    const position = first(table, "tblpPr"), grid = first(table, "tblGrid");
    if (!position || !grid) throw new Error("This structured table has changed its positioning. Convert the edited document online.");
    const x = Number(attr(position, "tblpX")) / 20, top = Number(attr(position, "tblpY")) / 20;
    const widths = [...grid.children].map(column => Number(attr(column, "w")) / 20);
    const rows = [...table.children].filter(node => node.localName === "tr");
    const heights = rows.map(row => Number(attr(first(row, "trHeight"), "val") || 400) / 20);
    const cells = rows.map(row => {
      let column = 0;
      return [...row.children].filter(node => node.localName === "tc").map(node => { const span = Number(attr(first(node, "gridSpan"), "val") || 1); const cell = { node, column, span }; column += span; return cell; });
    });
    let y = top;
    for (let r = 0; r < rows.length; r++) {
      for (const cell of cells[r]) {
        const merge = first(cell.node, "vMerge");
        if (merge && attr(merge, "val") !== "restart") continue;
        let count = 1;
        if (merge) while (cells[r + count]?.some(next => next.column === cell.column && first(next.node, "vMerge") && attr(first(next.node, "vMerge"), "val") !== "restart")) count++;
        const width = widths.slice(cell.column, cell.column + cell.span).reduce((a, b) => a + b, 0), height = heights.slice(r, r + count).reduce((a, b) => a + b, 0);
        const left = x + widths.slice(0, cell.column).reduce((a, b) => a + b, 0);
        page.drawRectangle({ x: left, y: page.getHeight() - y - height, width, height, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
        const margins = first(cell.node, "tcMar");
        let lineTop = y + Number(attr(margins && first(margins, "top"), "w") || 0) / 20;
        const lineX = left + Number(attr(margins && first(margins, "left"), "w") || 0) / 20;
        for (const item of [...cell.node.children].filter(node => node.localName === "p")) lineTop += await paragraph(item, lineX, lineTop);
      }
      y += heights[r];
    }
  }
  for (const section of sections) {
    const size = first(section.properties, "pgSz"), width = Number(attr(size, "w")) / 20, height = Number(attr(size, "h")) / 20;
    if (!width || !height) throw new Error("This Word page has invalid dimensions.");
    page = pdf.addPage([width, height]);
    for (const anchor of section.children.flatMap(child => all(child, "anchor"))) {
      const extent = first(anchor, "extent"), horizontal = first(anchor, "positionH"), vertical = first(anchor, "positionV");
      const w = Number(extent?.getAttribute("cx")) / 12700, h = Number(extent?.getAttribute("cy")) / 12700;
      const x = Number(first(horizontal, "posOffset")?.textContent) / 12700, top = Number(first(vertical, "posOffset")?.textContent) / 12700;
      const blip = first(anchor, "blip");
      if (blip) {
        const target = media.get(blip.getAttributeNS(relationships, "embed"));
        if (!target || !/^media\/[A-Za-z0-9_.-]+$/.test(target) || !files[`word/${target}`]) throw new Error("A copied Word graphic is missing or unsupported.");
        const bytes = files[`word/${target}`], image = bytes[0] === 137 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        page.drawImage(image, { x, y: height - top - h, width: w, height: h });
      }
      const text = first(anchor, "txbxContent");
      if (text) {
        const rotation = Number(first(anchor, "xfrm")?.getAttribute("rot") || 0) / 60000;
        const angle = rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const textX = x + (1 - c) * w / 2 + s * h / 2; let y = top - s * w / 2 + (1 - c) * h / 2;
        for (const item of [...text.children].filter(node => node.localName === "p")) y += await paragraph(item, textX, y, rotation);
      }
    }
    for (const child of section.children) {
      if (child.localName === "tbl") await drawTable(child);
      else {
        const clone = child.cloneNode(true); all(clone, "drawing").forEach(node => node.remove());
        if (content(clone).trim()) throw new Error("This edited Word file has text outside its structured boxes. Convert it online to preserve those edits.");
      }
    }
  }
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
