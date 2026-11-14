import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { before, after, test } from "node:test";
import yauzl from "yauzl";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as docx from "docx";
import { PDFParse } from "pdf-parse";
import { analyzeStructuredPdf } from "../services/structuredPdfService.js";
import { analyzePdfStructure, buildStructuredWord } from "../utils/pdfStructure.js";
import { structureFixture } from "./helpers/structureFixture.js";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "utilityhub-structure-test-"));
let fixture, pages, word;
function documentXml(bytes) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    zip.on("error", reject); zip.on("entry", entry => {
      if (entry.fileName !== "word/document.xml") return zip.readEntry();
      zip.openReadStream(entry, (err, stream) => { if (err) return reject(err); const parts = []; stream.on("data", chunk => parts.push(chunk)); stream.on("end", () => { zip.close(); resolve(Buffer.concat(parts).toString()); }); stream.on("error", reject); });
    }); zip.readEntry();
  }));
}
async function pixels(bytes) {
  const image = await loadImage(Buffer.from(bytes)), canvas = createCanvas(image.width, image.height), context = canvas.getContext("2d");
  context.drawImage(image, 0, 0); return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}
before(async () => { fixture = await structureFixture(); pages = await analyzeStructuredPdf(fixture.bytes); word = await docx.Packer.toBuffer(buildStructuredWord(pages, docx)); });
after(() => fs.rm(directory, { recursive: true, force: true }));

test("source page sizes, columns, headings, styles and line spacing are analyzed", () => {
  assert.deepEqual(pages.map(page => [page.width, page.height]), [[595, 842], [842, 595]]);
  const first = pages[0];
  const heading = first.blocks.find(block => block.lines.some(line => line.items.some(item => item.text === "ANALYSIS REPORT")));
  assert(heading); assert.equal(heading.x, 40); assert.equal(heading.lines[0].items[0].size, 22);
  assert(heading.lines[0].items[0].bold);
  const channels = heading.lines[0].items[0].color.match(/../g).map(channel => parseInt(channel, 16));
  assert(channels.every((channel, index) => Math.abs(channel - [26, 51, 179][index]) <= 1));
  const left = first.blocks.find(block => block.lines[0].items.some(item => item.text === "LEFT_COLUMN_LINE_1"));
  const right = first.blocks.find(block => block.lines[0].items.some(item => item.text === "RIGHT_COLUMN_LINE_1"));
  assert.equal(left.x, 40); assert.equal(right.x, 315); assert.equal(left.lines.length, 6); assert.equal(right.lines.length, 6);
  assert.equal(left.lines[1].baseline - left.lines[0].baseline, 16);
});

test("the original raster image is copied without OCR or pixel changes and overlay text remains editable", async () => {
  const image = pages[0].figures.find(figure => figure.image);
  assert(image); assert.equal(image.x, 50); assert.equal(image.y, 322); assert.equal(image.width, 180); assert.equal(image.height, 120);
  assert.deepEqual(await pixels(image.bytes), await pixels(fixture.imageBytes));
  const xml = await documentXml(word); assert.match(xml, /OVERLAY_TEXT_STAYS_EDITABLE/);
  assert.match(xml, /wrap="none" horzOverflow="overflow"/);
  assert.match(xml, /relativeHeight="100000"/);
});

test("a vector graph with a grid stays one figure with its bars, line and labels", async () => {
  assert.equal(pages[0].tables.length, 0);
  const graphs = pages[0].figures.filter(figure => !figure.image); assert.equal(graphs.length, 1);
  const graph = graphs[0]; assert(graph.x <= 315 && graph.x >= 313); assert(graph.width >= 210);
  assert(graph.y <= 272); assert(graph.y + graph.height >= 442);
  const image = await pixels(graph.bytes); let blue = 0, red = 0, green = 0;
  for (let i = 0; i < image.data.length; i += 4) { const [r, g, b] = image.data.subarray(i, i + 3); if (b > 180 && r < 100) blue++; if (r > 180 && g < 130 && b < 100) red++; if (g > 140 && r < 100) green++; }
  assert(blue > 500 && red > 500 && green > 500);
});

test("real Word tables retain their coordinates, columns, blank cells and text", async () => {
  assert.equal(pages[1].tables.length, 1); const table = pages[1].tables[0];
  assert.equal(table.minXY.x, 40); assert.equal(table.minXY.y, 95); assert.equal(table.rows.length, 3); assert.equal(table.colPivots.length, 4);
  assert.equal(table.rows[2][1].items.length, 0);
  const xml = await documentXml(word); assert.match(xml, /<w:tbl>/); assert.match(xml, /w:tblpX="800"/); assert.match(xml, /w:tblpY="1900"/);
  assert.equal((xml.match(/<w:sectPr>/g) || []).length, 2); assert.match(xml, /<w:txbxContent>/); assert.match(xml, /<w:spacing[^>]*w:line="320"/);
});

test("clipped and rotated images use the correct visible bounds without swallowing overlay text", async () => {
  const clipped = pages[1].figures.find(figure => Math.abs(figure.x - 665) < 0.1);
  assert(clipped); assert.equal(clipped.width, 50); assert.equal(clipped.height, 40); assert.equal(clipped.method, "copied-image");
  const rotated = pages[1].figures.find(figure => Math.abs(figure.x - 680) < 0.1);
  assert(rotated); assert(Math.abs(rotated.width - 60) < 0.1); assert(Math.abs(rotated.height - 90) < 0.1);
  assert.match(await documentXml(word), /CLIP_TEXT/);
});

test("complex clipped graphics do not duplicate native text, and angled text retains its Word rotation", async () => {
  const figure = pages[1].figures.find(figure => Math.abs(figure.x - 755) < 0.1);
  assert(figure); assert.equal(figure.method, "rendered-graphic");
  const image = await pixels(figure.bytes); let black = 0;
  for (let i = 0; i < image.data.length; i += 4) if (image.data[i] < 50 && image.data[i + 1] < 50 && image.data[i + 2] < 50 && image.data[i + 3] > 200) black++;
  assert.equal(black, 0, "native label must stay editable rather than also appearing inside the graphic");
  const xml = await documentXml(word); assert.match(xml, /GRAPH_LABEL/); assert.match(xml, /ROTATED_LABEL/); assert.match(xml, /rot="-2100000"/);
});

test("structured Word content survives a real LibreOffice roundtrip on the correct pages", async () => {
  const source = path.join(directory, "structure.docx"); await fs.writeFile(source, word);
  const { convertDocument } = await import("../services/fileService.js");
  const target = await convertDocument({ path: source, filename: "structure.docx" }, "pdf", { outputDir: directory, controller: new AbortController() });
  const parser = new PDFParse({ data: new Uint8Array(await fs.readFile(target)) });
  try {
    const text = await parser.getText(); assert.equal(text.total, 2); assert.match(text.pages[0].text, /LEFT_COLUMN_LINE_6/); assert.match(text.pages[0].text, /RIGHT_COLUMN_LINE_6/);
    assert.match(text.pages[0].text, /OVERLAY_TEXT_STAYS_EDITABLE/); assert.match(text.pages[1].text, /LANDSCAPE PAGE TWO/);
    assert.equal((await parser.getTable()).pages.flatMap(page => page.tables).length, 1);
    assert((await parser.getImage()).pages[0].images.length >= 2);
  } finally { await parser.destroy(); }
});

test("cancellation is checked before loading a document", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(analyzePdfStructure(fixture.bytes, { signal: controller.signal }), { name: "AbortError" });
});
