import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createCanvas, loadImage, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import * as geometry from "pdf-parse";
import * as docx from "docx";
import { analyzePdfStructure, buildStructuredWord, wordTextMeasure } from "../utils/pdfStructure.js";

globalThis.DOMMatrix ||= DOMMatrix;
globalThis.ImageData ||= ImageData;
globalThis.Path2D ||= Path2D;
const require = createRequire(import.meta.url);
const assets = path.dirname(require.resolve("pdfjs-dist/package.json")).replace(/\\/g, "/");

export async function analyzeStructuredPdf(bytes, options = {}) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const metrics = createCanvas(1, 1).getContext("2d");
  return analyzePdfStructure(bytes, { pdfjs, geometry, createCanvas, loadImage: bytes => loadImage(Buffer.from(bytes)),
    measureText: await wordTextMeasure(item => { metrics.font = `${item.italic ? "italic " : ""}${item.bold ? "bold " : ""}${item.size}px "${item.font}"`; return metrics.measureText(item.text).width; }),
    encodeCanvas: async canvas => new Uint8Array(await canvas.encode("png")),
    pdfOptions: { useSystemFonts: false, disableFontFace: true, standardFontDataUrl: `${assets}/standard_fonts/`, cMapUrl: `${assets}/cmaps/`, cMapPacked: true, wasmUrl: `${assets}/wasm/` },
    ...options,
  });
}

export async function structuredPdfToWord(file, job) {
  const pages = await analyzeStructuredPdf(new Uint8Array(await fs.readFile(file.path)), { signal: job.controller.signal });
  const target = path.join(job.outputDir, `${randomUUID()}.docx`);
  await fs.writeFile(target, await docx.Packer.toBuffer(buildStructuredWord(pages, docx)));
  return target;
}
