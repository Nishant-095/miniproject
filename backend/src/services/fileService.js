import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PDFDocument, PageSizes, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  MAX_PAGES,
  MAX_TEXT_LENGTH,
  ghostscriptBinary,
  libreOfficeBinary,
} from "../config/fileConfig.js";
import { runProgram } from "./programService.js";
import { decodeText, validateDocx } from "../utils/fileValidation.js";
import { httpError } from "../utils/httpError.js";
function outputPath(job, extension) {
  // Builds a result path inside the current job.
  return path.join(job.outputDir, `${randomUUID()}.${extension}`);
}
export async function readPdf(filePath) {
  // Loads a PDF and checks its page limit.
  let document;
  let pageCount;
  try {
    document = await PDFDocument.load(await fs.readFile(filePath));
    pageCount = document.getPageCount();
  } catch {
    throw httpError(
      422,
      "This PDF is damaged, password-protected, or unsupported. Try an unlocked PDF.",
    );
  }
  if (!pageCount || pageCount > MAX_PAGES) {
    throw httpError(413, `Use a PDF with 1 to ${MAX_PAGES} pages.`);
  }
  return document;
}
async function savePdf(document, job) {
  // Saves a created PDF inside the current job.
  const target = outputPath(job, "pdf");
  await fs.writeFile(target, await document.save());
  return target;
}
export async function mergePdfs(files, job) {
  // Copies uploaded PDF pages in order.
  const document = await PDFDocument.create();
  // Multipart file order is the order selected in the frontend.
  for (const file of files) {
    const source = await readPdf(file.path);
    if (document.getPageCount() + source.getPageCount() > MAX_PAGES) {
      throw httpError(
        413,
        `The merged PDF may contain at most ${MAX_PAGES} pages.`,
      );
    }
    const pages = await document.copyPages(source, source.getPageIndices());
    pages.forEach((page) =>
      // Appends a copied page to the merged PDF.
      document.addPage(page),
    );
  }
  return savePdf(document, job);
}
export async function imagesToPdf(files, job) {
  // Places each image on a fitted PDF page.
  const document = await PDFDocument.create();
  for (const file of files) {
    const bytes = await fs.readFile(file.path);
    let image;
    try {
      image = file.filename.toLowerCase().endsWith(".png")
        ? await document.embedPng(bytes)
        : await document.embedJpg(bytes);
    } catch {
      throw httpError(
        422,
        "One of these images could not be decoded. Try another JPG or PNG.",
      );
    }
    const landscape = image.width > image.height;
    const page = document.addPage(
      landscape ? [PageSizes.A4[1], PageSizes.A4[0]] : PageSizes.A4,
    );
    const { width, height } = image.scaleToFit(
      page.getWidth() - 48,
      page.getHeight() - 48,
    );
    page.drawImage(image, {
      x: (page.getWidth() - width) / 2,
      y: (page.getHeight() - height) / 2,
      width,
      height,
    });
  }
  return savePdf(document, job);
}
function wrapParagraph(paragraph, font, size, maxWidth) {
  // Wraps text to the available PDF width.
  if (!paragraph.trim()) return [""];
  const lines = [];
  let line = "";
  for (const word of paragraph.trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    // Break very long words/URLs too, so text never runs off the page.
    for (const character of word) {
      if (font.widthOfTextAtSize(line + character, size) > maxWidth && line) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}
export async function textToPdf(input, job) {
  // Creates PDF pages from validated text.
  if (
    typeof input !== "string" ||
    !input.trim() ||
    input.length > MAX_TEXT_LENGTH
  ) {
    throw httpError(400, "Enter 1 to 100,000 characters of text.");
  }
  const text = input.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw httpError(400, "Remove control characters from your text.");
  }
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await fs.readFile(
    new URL("../assets/fonts/DejaVuSans.ttf", import.meta.url),
  );
  const font = await document.embedFont(fontBytes, {
    subset: true,
  });
  const available = new Set(font.getCharacterSet());
  const unsupported = [
    ...new Set(
      [...text].filter(
        (character) =>
          // Checks which items match the condition.
          character !== "\n" && !available.has(character.codePointAt(0)),
      ),
    ),
  ];
  if (unsupported.length) {
    throw httpError(
      400,
      `The bundled font cannot display: ${unsupported.slice(0, 5).join(" ")}. Remove those characters or use a different text.`,
    );
  }
  const size = 11;
  const margin = 48;
  const maxWidth = PageSizes.A4[0] - margin * 2;
  const lines = text.split("\n").flatMap((paragraph) =>
    // Builds a value for each item.
    wrapParagraph(paragraph, font, size, maxWidth),
  );
  let page;
  let y = 0;
  for (const line of lines) {
    if (!page || y < margin + 18) {
      if (document.getPageCount() >= MAX_PAGES)
        throw httpError(413, "This text produces too many pages.");
      page = document.addPage(PageSizes.A4);
      y = page.getHeight() - margin - size;
    }
    if (line)
      page.drawText(line, {
        x: margin,
        y,
        size,
        font,
        color: rgb(0.13, 0.14, 0.2),
      });
    y -= 17;
  }
  document.getPages().forEach((item, index) => {
    // Adds page numbers to the generated PDF.
    const label = `${index + 1} / ${document.getPageCount()}`;
    item.drawText(label, {
      x: (item.getWidth() - font.widthOfTextAtSize(label, 8)) / 2,
      y: 25,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.55),
    });
  });
  document.setTitle("Text document");
  return savePdf(document, job);
}
export function parsePageRanges(ranges, pageCount) {
  // Validates page ranges and removes repeated pages.
  if (typeof ranges !== "string" || !ranges.trim() || ranges.length > 2000) {
    throw httpError(400, "Enter page ranges such as 1-3, 5.");
  }
  const indices = new Set();
  for (const range of ranges.split(",")) {
    const match = range.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw httpError(
        400,
        "Use page ranges such as 1-3, 5. Do not leave empty ranges.",
      );
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) ||
      first < 1 ||
      last < first ||
      last > pageCount
    ) {
      throw httpError(
        400,
        `Page numbers must be between 1 and ${pageCount}, with the smaller number first in a range.`,
      );
    }
    for (let page = first; page <= last; page += 1) indices.add(page - 1);
  }
  return [...indices];
}
export async function splitPdf(file, ranges, job) {
  // Copies only the selected pages into a PDF.
  const source = await readPdf(file.path);
  const document = await PDFDocument.create();
  const pages = await document.copyPages(
    source,
    parsePageRanges(ranges, source.getPageCount()),
  );
  pages.forEach((page) =>
    // Appends an extracted PDF page.
    document.addPage(page),
  );
  return savePdf(document, job);
}
export async function compressPdf(file, level, job) {
  // Runs Ghostscript and keeps the smaller result.
  const settings = {
    low: "/printer",
    medium: "/ebook",
    high: "/screen",
  };
  if (!Object.hasOwn(settings, level))
    throw httpError(400, "Choose low, medium, or high compression.");
  const original = await readPdf(file.path);
  const target = outputPath(job, "pdf");
  await runProgram(
    ghostscriptBinary(),
    [
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dQUIET",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.6",
      `-dPDFSETTINGS=${settings[level]}`,
      `-sOutputFile=${target}`,
      file.path,
    ],
    "Ghostscript",
    job.controller.signal,
  );
  const processed = await readPdf(target);
  if (processed.getPageCount() !== original.getPageCount()) {
    throw httpError(
      422,
      "Compression changed the page count. The result was discarded.",
    );
  }
  const candidateSize = (await fs.stat(target)).size;
  const unchanged = candidateSize >= file.size;
  if (unchanged) await fs.copyFile(file.path, target);
  const compressedSize = unchanged ? file.size : candidateSize;
  return {
    target,
    originalSize: file.size,
    compressedSize,
    unchanged,
    savedPercent: ((file.size - compressedSize) / file.size) * 100,
  };
}
async function pdfToWord(file, job) {
  try {
    const { structuredPdfToWord } = await import("./structuredPdfService.js");
    const target = await structuredPdfToWord(file, job);
    await validateDocx(target);
    return target;
  } catch (error) {
    if (error.status) throw error;
    throw httpError(/10 million|1 to 1000|256 MB/.test(error.message) ? 413 : 422, error.message || "This PDF could not be converted. Try an unlocked, undamaged file.");
  }
}
export async function convertDocument(file, format, job) {
  // Converts a supported document to the chosen format.
  const extension = path.extname(file.filename).toLowerCase();
  if (format === "pdf" && extension === ".txt") {
    return textToPdf(decodeText(await fs.readFile(file.path)), job);
  }
  if (format === "pdf" && [".jpg", ".jpeg", ".png"].includes(extension)) {
    return imagesToPdf([file], job);
  }
  const toPdf = extension === ".docx" && format === "pdf";
  const toDocx = extension === ".pdf" && format === "docx";
  if (!toPdf && !toDocx) {
    throw httpError(
      415,
      "Supported conversions: DOCX to PDF, PDF to DOCX, TXT to PDF, and JPG/PNG to PDF.",
    );
  }
  if (toDocx) return pdfToWord(file, job);
  const input = file;
  const profile = path.join(job.outputDir, "office-profile");
  const args = [
    `-env:UserInstallation=${pathToFileURL(profile).href}`,
    "--headless",
    "--nologo",
    "--nodefault",
    "--norestore",
  ];
  args.push(
    "--convert-to",
    "pdf:writer_pdf_Export",
    "--outdir",
    job.outputDir,
    input.path,
  );
  await runProgram(
    libreOfficeBinary(),
    args,
    "LibreOffice",
    job.controller.signal,
  );
  const target = path.join(
    job.outputDir,
    `${path.parse(input.filename).name}.${format}`,
  );
  const info = await fs.stat(target).catch(
    () =>
      // Handles a failed operation.
      null,
  );
  if (!info?.size)
    throw httpError(
      422,
      "LibreOffice did not produce a document. Try a simpler, unlocked input file.",
    );
  if (toPdf) await readPdf(target);
  else await validateDocx(target);
  return target;
}
export async function sendOutput(req, res, target, filename) {
  // Sends the result and removes temporary uploads.
  const { size } = await fs.stat(target);
  res.set("Cache-Control", "no-store");
  res.set("X-Output-Size", String(size));
  // Processing is finished, so the original upload can be removed before downloading.
  await fs.rm(req.fileJob.inputDir, {
    recursive: true,
    force: true,
  });
  await new Promise((resolve, reject) => {
    // Starts the asynchronous operation.
    res.download(target, filename, (error) => {
      // Completes or rejects the download response.
      if (error)
        reject(
          httpError(500, "The download was interrupted. Please try again."),
        );
      else resolve();
    });
  });
}
