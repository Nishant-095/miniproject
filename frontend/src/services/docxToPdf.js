import { PDFDocument, PageSizes, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { MAX_PDF_PAGES } from "../utils/files.js";

// Read Mammoth's generated HTML without injecting it into the page or loading links.
export async function structuredDocxPdf(html) {
  const root = new DOMParser().parseFromString(html, "text/html").body;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const response = await fetch("/fonts/DejaVuSans.ttf");
  if (!response.ok) throw new Error("The offline font is missing. Open the app while connected once.");
  const font = await pdf.embedFont(await response.arrayBuffer(), { subset: true });
  const charset = new Set(font.getCharacterSet());
  const margin = 40, pageWidth = PageSizes.A4[0], usable = pageWidth - 2 * margin;
  const fontSize = 10, lineHeight = 14, padding = 5;
  let page, y;
  function nextPage() {
    if (pdf.getPageCount() >= MAX_PDF_PAGES) throw new Error(`This document produces more than ${MAX_PDF_PAGES} pages.`);
    page = pdf.addPage(PageSizes.A4); y = page.getHeight() - margin;
  }
  nextPage();
  function lines(value, width, size = fontSize) {
    const text = value.replace(/\r/g, "").replace(/\t/g, "    ");
    for (const character of text) if (character !== "\n" && !charset.has(character.codePointAt(0))) throw new Error(`The offline PDF font cannot display: ${character}`);
    const result = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
        if (line) result.push(line);
        line = "";
        for (const character of word) {
          if (line && font.widthOfTextAtSize(line + character, size) > width) { result.push(line); line = ""; }
          line += character;
        }
      }
      result.push(line);
    }
    return result;
  }
  function inlineText(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeName === "BR") return node.classList.contains("uh-page-break") ? "\f" : "\n";
    if (node.nodeName === "IMG") return "";
    const value = [...node.childNodes].map(inlineText).join("");
    return ["P", "LI"].includes(node.nodeName) ? `${value}\n` : value;
  }
  async function images(node, maxWidth) {
    const result = [];
    for (const element of node.querySelectorAll("img")) {
      const match = element.getAttribute("src")?.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/);
      if (!match) throw new Error("An embedded image uses an unsupported format. Replace it with an embedded JPG or PNG in your Word editor.");
      const bytes = Uint8Array.from(atob(match[2].replace(/\s/g,"")), c => c.charCodeAt(0));
      const image = match[1] === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.min(1, maxWidth / image.width, 400 / image.height);
      result.push({ image, width: image.width * scale, height: image.height * scale });
    }
    return result;
  }
  function drawImages(items, x, top) {
    for (const item of items) { page.drawImage(item.image, { x, y: top - item.height, width: item.width, height: item.height }); top -= item.height + padding; }
  }
  async function table(element) {
    const rows = [...element.rows], occupied = [], cells = [];
    if (rows.length > 5000) throw new Error("This table has too many rows to convert offline.");
    let columns = 0;
    rows.forEach((row, r) => {
      occupied[r] ||= [];
      let column = 0;
      for (const node of row.cells) {
        while (occupied[r][column]) column++;
        const colspan = Math.max(1, node.colSpan), rowspan = Math.max(1, Math.min(node.rowSpan, rows.length - r));
        if (column + colspan > 32) throw new Error("Tables with more than 32 columns are not supported. Split this table in your Word editor.");
        cells.push({ node, row: r, column, colspan, rowspan });
        for (let rr = r; rr < r + rowspan; rr++) { occupied[rr] ||= []; for (let cc = column; cc < column + colspan; cc++) occupied[rr][cc] = true; }
        column += colspan;
      }
      columns = Math.max(columns, occupied[r].length);
    });
    if (!columns) return;
    const unit = usable / columns, heights = rows.map(() => 26);
    for (const cell of cells) {
      cell.lines = lines(inlineText(cell.node).trim(), unit * cell.colspan - padding * 2);
      cell.images = await images(cell.node, unit * cell.colspan - padding * 2);
      const height = padding * 2 + cell.lines.length * lineHeight + cell.images.reduce((sum,x) => sum + x.height + padding,0);
      const current = heights.slice(cell.row, cell.row + cell.rowspan).reduce((a,b) => a + b,0);
      if (height > current) heights[cell.row + cell.rowspan - 1] += height - current;
    }
    for (let r = 0; r < rows.length;) {
      let end = r + 1;
      for (let rr = r; rr < end; rr++) for (const cell of cells.filter(x => x.row === rr)) end = Math.max(end, rr + cell.rowspan);
      const height = heights.slice(r,end).reduce((a,b) => a + b,0);
      if (height > PageSizes.A4[1] - margin * 2) throw new Error("A table row is taller than one page. Shorten the row in your Word editor.");
      if (y - height < margin) nextPage();
      for (const cell of cells.filter(x => x.row >= r && x.row < end)) {
        const top = y - heights.slice(r,cell.row).reduce((a,b) => a + b,0), h = heights.slice(cell.row,cell.row+cell.rowspan).reduce((a,b) => a + b,0), x = margin + unit * cell.column;
        page.drawRectangle({ x, y: top-h, width: unit*cell.colspan, height: h, borderWidth: 0.65, borderColor: rgb(0,0,0) });
        cell.lines.forEach((line,index) => { if (line) page.drawText(line,{x:x+padding,y:top-padding-fontSize-index*lineHeight,font,size:fontSize}); });
        drawImages(cell.images,x+padding,top-padding-cell.lines.length*lineHeight);
      }
      y -= height; r = end;
    }
    y -= 10;
  }
  async function paragraph(node) {
    const text = inlineText(node).replace(/^[ \t\n]+|[ \t\n]+$/g, "");
    const heading = Number(/^H([1-6])$/.exec(node.nodeName)?.[1] || 0);
    const size = heading ? Math.max(11, 23 - heading * 3) : fontSize, height = size * 1.4;
    const parts = text.split("\f");
    for (let index = 0; index < parts.length; index++) {
      if (index) nextPage();
      if (!parts[index]) continue;
      for (const line of lines(parts[index], usable, size)) {
        if (y - height < margin) nextPage();
        const width = font.widthOfTextAtSize(line, size);
        const x = node.classList.contains("uh-center") ? margin + (usable - width) / 2 : node.classList.contains("uh-right") ? pageWidth - margin - width : margin;
        if (line) page.drawText(line, { x, y: y - size, font, size });
        y -= height;
      }
      y -= 5;
    }
    for (const item of await images(node, usable)) { if (y-item.height-padding<margin) nextPage(); drawImages([item],margin,y); y -= item.height+padding; }
  }
  for (const node of root.children) {
    if (node.nodeName === "TABLE") await table(node);
    else if (["UL","OL"].includes(node.nodeName)) for (const item of node.children) await paragraph(item);
    else await paragraph(node);
  }
  return new Blob([await pdf.save()],{type:"application/pdf"});
}
