import { PDFDocument, PageSizes, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { MAX_PDF_PAGES } from "../utils/files.js";
import { validateLocalFiles } from "./localFilePolicy.js";

const pdfType = "application/pdf";
const result = (data, headers = {}) => ({ data, headers });
const pdfBlob = (bytes) => new Blob([bytes], { type: pdfType });

async function readPdf(file) {
  if (!file) throw new Error("Choose a PDF file first.");
  let pdf;
  try {
    pdf = await PDFDocument.load(await file.arrayBuffer());
  } catch {
    throw new Error("This PDF is damaged, password-protected, or unsupported.");
  }
  if (!pdf.getPageCount() || pdf.getPageCount() > MAX_PDF_PAGES) throw new Error(`Use a PDF with 1 to ${MAX_PDF_PAGES} pages.`);
  return pdf;
}

function pageNumbers(ranges, count) {
  const pages = new Set();
  for (const range of String(ranges || "").split(",")) {
    const match = range.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use page ranges such as 1-3, 5.");
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > count) throw new Error(`Choose page numbers between 1 and ${count}.`);
    for (let n = start; n <= end; n++) pages.add(n - 1);
  }
  return [...pages];
}

async function imagePdf(files) {
  if (!files.length) throw new Error("Choose at least one JPG or PNG.");
  const doc = await PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const image = /\.png$/i.test(file.name) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const page = doc.addPage(image.width > image.height ? [PageSizes.A4[1], PageSizes.A4[0]] : PageSizes.A4);
    const size = image.scaleToFit(page.getWidth() - 48, page.getHeight() - 48);
    page.drawImage(image, { x: (page.getWidth() - size.width) / 2, y: (page.getHeight() - size.height) / 2, ...size });
  }
  return pdfBlob(await doc.save());
}

async function textPdf(input) {
  const text = String(input || "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  if (!text.trim() || text.length > 100000) throw new Error("Enter 1 to 100,000 characters of text.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("Remove control characters from your text.");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontResponse = await fetch("/fonts/DejaVuSans.ttf");
  if (!fontResponse.ok) throw new Error("The offline font is not available. Open the app once while connected.");
  const font = await doc.embedFont(await fontResponse.arrayBuffer(), { subset: true });
  const allowed = new Set(font.getCharacterSet());
  const missing = [...new Set([...text].filter(c => c !== "\n" && !allowed.has(c.codePointAt(0))))];
  if (missing.length) throw new Error(`The PDF font cannot display: ${missing.slice(0, 5).join(" ")}.`);
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const character of paragraph) {
      if (line && font.widthOfTextAtSize(line + character, 11) > PageSizes.A4[0] - 96) { lines.push(line); line = ""; }
      line += character;
    }
    lines.push(line);
  }
  let page, y = 0;
  for (const line of lines) {
    if (!page || y < 66) { if (doc.getPageCount() >= MAX_PDF_PAGES) throw new Error("This text produces too many pages."); page = doc.addPage(PageSizes.A4); y = page.getHeight() - 59; }
    if (line) page.drawText(line, { x: 48, y, size: 11, font, color: rgb(0.13, 0.14, 0.2) });
    y -= 17;
  }
  return pdfBlob(await doc.save());
}

async function imageResult(form) {
  const file = form.get("file");
  if (!file) throw new Error("Choose an image first.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (bitmap.width * bitmap.height > 40000000) throw new Error("Use an image smaller than 40 megapixels.");
    const widthInput = form.get("width"), heightInput = form.get("height");
    const maxW = widthInput ? Number(widthInput) : bitmap.width, maxH = heightInput ? Number(heightInput) : bitmap.height;
    if ((widthInput && (!Number.isInteger(maxW) || maxW < 1 || maxW > 6000)) || (heightInput && (!Number.isInteger(maxH) || maxH < 1 || maxH > 6000))) throw new Error("Dimensions must be whole numbers between 1 and 6000 pixels.");
    const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    const format = String(form.get("format") || "jpeg");
    const quality = Number(form.get("quality") || 80);
    if (!["jpeg", "png", "webp"].includes(format)) throw new Error("Choose JPEG, PNG or WebP output.");
    if (!Number.isFinite(quality) || quality < 10 || quality > 100) throw new Error("Choose image quality between 10 and 100.");
    if (format === "jpeg") { context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, `image/${format}`, quality / 100));
    if (!blob || blob.type !== `image/${format}`) throw new Error("This browser cannot create the selected image format.");
    return result(blob, { "x-original-size": String(file.size), "x-compressed-size": String(blob.size), "x-saved-percent": String((1 - blob.size / file.size) * 100), "x-image-width": String(canvas.width), "x-image-height": String(canvas.height) });
  } finally { bitmap.close(); }
}

async function convertDocument(form, options) {
  const file = form.get("file"), format = form.get("format");
  if (!file) throw new Error("Choose a file to convert.");
  if (format === "pdf" && /\.txt$/i.test(file.name)) return textPdf(await file.text());
  if (format === "pdf" && /\.(png|jpe?g)$/i.test(file.name)) return imagePdf([file]);
  if (format === "pdf" && /\.docx$/i.test(file.name)) {
    const { structuredWordPdf } = await import("./structuredWordPdf.js");
    const structured = await structuredWordPdf(file);
    if (structured) return structured;
    const mammoth = await import("mammoth/mammoth.browser");
    const engine = mammoth.default || mammoth;
    const styleMap = ["br[type='page'] => br.uh-page-break"];
    for (const align of ["left", "center", "right", "both"]) {
      for (let heading = 0; heading <= 6; heading++) {
        styleMap.push(`p[style-name='UtilityHub-${align}-${heading}'] => ${heading ? `h${heading}` : "p"}.uh-${align}:fresh`);
      }
    }
    const converted = await engine.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
      externalFileAccess: false, styleMap,
      transformDocument: engine.transforms.paragraph(paragraph => {
        if (paragraph.numbering) return paragraph;
        const align = ["center", "right", "both"].includes(paragraph.alignment) ? paragraph.alignment : "left";
        const heading = Number(/heading\s*([1-6])/i.exec(paragraph.styleName || paragraph.styleId || "")?.[1] || 0);
        return { ...paragraph, styleName: `UtilityHub-${align}-${heading}` };
      }),
    });
    const { structuredDocxPdf } = await import("./docxToPdf.js");
    return structuredDocxPdf(converted.value);
  }
  if (format === "docx" && /\.pdf$/i.test(file.name)) {
    const { structuredPdfToWord } = await import("./structuredPdf.js");
    return structuredPdfToWord(file, options);
  }

  throw new Error("This conversion is not supported.");
}

export async function processLocalFile(action, payload, options = {}) {
  if (options.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  await validateLocalFiles(action, payload);
  if (options.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  if (action === "processImage") return imageResult(payload);
  if (action === "textToPdf") return result(await textPdf(payload.text));
  if (action === "convertDocument") return result(await convertDocument(payload, options));
  if (action === "imagesToPdf") return result(await imagePdf(payload.getAll("files")));
  if (action === "mergePdfs") {
    const files = payload.getAll("files");
    if (files.length < 2) throw new Error("Choose at least two PDFs.");
    const output = await PDFDocument.create();
    for (const file of files) { const doc = await readPdf(file); if (output.getPageCount() + doc.getPageCount() > MAX_PDF_PAGES) throw new Error(`The merged PDF may contain at most ${MAX_PDF_PAGES} pages.`); (await output.copyPages(doc, doc.getPageIndices())).forEach(page => output.addPage(page)); }
    return result(pdfBlob(await output.save()));
  }
  if (action === "splitPdf") {
    const input = await readPdf(payload.get("file")), output = await PDFDocument.create();
    (await output.copyPages(input, pageNumbers(payload.get("ranges"), input.getPageCount()))).forEach(page => output.addPage(page));
    return result(pdfBlob(await output.save()));
  }
  if (action === "compressPdf") {
    const file = payload.get("file"), doc = await readPdf(file);
    const { compressLocalPdf } = await import("./compressLocalPdf.js");
    const bytes = await compressLocalPdf(doc, payload.get("level") || "medium", options);
    const unchanged = bytes.length >= file.size;
    const blob = unchanged ? file : pdfBlob(bytes);
    return result(blob, { "x-original-size": String(file.size), "x-compressed-size": String(blob.size), "x-saved-percent": String((1 - blob.size / file.size) * 100), "x-compression-result": unchanged ? "unchanged" : "compressed" });
  }
  throw new Error("This file tool is not supported.");
}

export const processOfflineFile = processLocalFile;

export async function exportOfflineExpenses(rows, month, format) {
  const columns = ["Date", "Category", "Amount (INR)", "Payment method", "Note"];
  const values = rows.map(row => [row.date, row.category, row.amount, row.paymentMethod, row.note || ""]);
  if (format === "csv") {
    const cell = value => {
      let text = String(value ?? "");
      if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    return new Blob([[columns, ...values].map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  }
  if (format !== "pdf") throw new Error("Choose CSV or PDF export.");
  const report = [`UtilityHub expenses: ${month}`, "", ...values.map(row => `${row[0]} | ${row[1]} | INR ${row[2]} | ${row[3]} | ${row[4]}`), "", `Total: INR ${(rows.reduce((sum, row) => sum + row.amountPaise, 0) / 100).toFixed(2)}`].join("\n");
  return textPdf(report);
}
