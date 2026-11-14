import fs from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";
import { imageSize } from "image-size";
import { MAX_BATCH_SIZE, MAX_TEXT_LENGTH } from "../config/fileConfig.js";
import { httpError } from "./httpError.js";
export function safeFilename(name) {
  // Removes paths and unsafe filename characters.
  const base = path.win32.basename(name);
  const extension = path.extname(base).toLowerCase();
  const stem = base
    .slice(0, base.length - extension.length)
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${stem.slice(0, 100 - extension.length) || "file"}${extension}`;
}
export function validateDocx(filePath) {
  // Checks the Word archive and expansion limits.
  return new Promise((resolve, reject) => {
    // Starts the asynchronous operation.
    yauzl.open(
      filePath,
      {
        lazyEntries: true,
      },
      (error, zip) => {
        // Inspects the Word archive before accepting it.
        if (error)
          return reject(
            httpError(415, "This file is not a valid DOCX document."),
          );
        const names = new Set();
        let expandedBytes = 0;
        function invalid(message) {
          // Rejects an unsafe or damaged Word archive.
          zip.close();
          reject(httpError(415, message));
        }
        if (zip.entryCount > 2000)
          return invalid("This DOCX contains too many archive entries.");
        zip.on("error", () =>
          // Handles error events.
          reject(httpError(415, "This DOCX archive is damaged.")),
        );
        zip.on("entry", (entry) => {
          // Handles entry events.
          expandedBytes += entry.uncompressedSize;
          if (
            expandedBytes > 100 * 1024 * 1024 ||
            entry.generalPurposeBitFlag & 1
          ) {
            return invalid(
              "Encrypted or excessively expanded DOCX files are not supported.",
            );
          }
          if (
            entry.fileName.split("/").includes("..") ||
            /vbaProject\.bin$/i.test(entry.fileName)
          ) {
            return invalid("This DOCX contains unsupported content.");
          }
          names.add(entry.fileName);
          zip.readEntry();
        });
        zip.on("end", () => {
          // Handles end events.
          if (
            !names.has("[Content_Types].xml") ||
            !names.has("word/document.xml")
          ) {
            return reject(
              httpError(
                415,
                "Choose a DOCX file, not another type of ZIP archive.",
              ),
            );
          }
          resolve();
        });
        zip.readEntry();
      },
    );
  });
}
export function decodeText(bytes) {
  // Decodes and validates a UTF-8 text upload.
  let text;
  try {
    text = new TextDecoder("utf-8", {
      fatal: true,
    })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    throw httpError(
      415,
      "Save your TXT file using UTF-8 encoding and try again.",
    );
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw httpError(415, "This file contains binary data, not plain text.");
  }
  if (!text.trim() || text.length > MAX_TEXT_LENGTH) {
    throw httpError(
      400,
      `Text must contain 1 to ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters.`,
    );
  }
  return text;
}
export async function validateUploadContents(files) {
  // Checks total size and actual file contents.
  if (
    files.reduce(
      (size, file) =>
        // Combines the items into one value.
        size + file.size,
      0,
    ) > MAX_BATCH_SIZE
  ) {
    throw httpError(413, "The selected files must total 80 MB or less.");
  }
  let imagePixels = 0;
  for (const file of files) {
    const ext = path.extname(file.filename).toLowerCase();
    if (file.size === 0)
      throw httpError(400, "Empty files cannot be processed.");
    if (ext === ".docx") {
      await validateDocx(file.path);
      continue;
    }
    const bytes = await fs.readFile(file.path);
    if (ext === ".pdf" && bytes.subarray(0, 5).toString() !== "%PDF-") {
      throw httpError(415, "The file contents do not match a PDF.");
    }
    if ([".jpg", ".jpeg", ".png"].includes(ext)) {
      let size;
      try {
        size = imageSize(bytes);
      } catch {
        throw httpError(415, "This image is damaged or is not a JPG/PNG.");
      }
      const expected = ext === ".png" ? "png" : "jpg";
      if (size.type !== expected)
        throw httpError(415, "The image contents do not match its extension.");
      imagePixels += size.width * size.height;
      if (imagePixels > 60000000)
        throw httpError(
          413,
          "Use images totalling less than 60 megapixels per batch.",
        );
      if (
        !size.width ||
        !size.height ||
        size.width * size.height > 40000000 ||
        size.width > 12000 ||
        size.height > 12000
      ) {
        throw httpError(
          413,
          "Use an image under 40 megapixels and 12,000 pixels on each side.",
        );
      }
    }
    if (ext === ".txt") decodeText(bytes);
  }
}
