import { uploadSizeError } from "../utils/files.js";

const extensions = {
  compressPdf: ["pdf"], mergePdfs: ["pdf"], splitPdf: ["pdf"],
  imagesToPdf: ["jpg", "jpeg", "png"], processImage: ["jpg", "jpeg", "png"],
  convertDocument: ["pdf", "docx", "txt", "jpg", "jpeg", "png"],
};

export function imageDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  let offset = 2;
  while (offset + 9 < bytes.length && bytes[0] === 255 && bytes[1] === 216) {
    if (bytes[offset++] !== 255) break;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += length;
  }
  throw new Error("This image has an invalid or unsupported header.");
}

export async function validateLocalFiles(action, payload) {
  if (action === "textToPdf") return;
  if (!extensions[action]) throw new Error("Choose a supported file tool.");
  if (!(payload instanceof FormData)) throw new Error("Choose a file to continue.");
  const many = ["mergePdfs", "imagesToPdf"].includes(action);
  const files = payload.getAll(many ? "files" : "file");
  if (!files.length || files.some(file => !(file instanceof Blob))) throw new Error("Choose a file to continue.");
  if (files.length > 10 || (!many && files.length !== 1)) throw new Error("Choose at most 10 files.");
  const error = uploadSizeError(files);
  if (error) throw new Error(error);
  let pixels = 0;
  for (const file of files) {
    if (!file.size) throw new Error("Choose a non-empty file.");
    const ext = file.name?.split(".").pop().toLowerCase();
    if (!extensions[action].includes(ext)) throw new Error("The selected file type is not supported by this tool.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (ext === "pdf" && !new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-")) throw new Error("This file is not a PDF.");
    if (ext === "docx" && !(bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4)) throw new Error("This file is not a Word DOCX document.");
    if (ext === "txt") {
      try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new Error("Save the text file with UTF-8 encoding and try again."); }
    }
    if (["jpg", "jpeg", "png"].includes(ext)) {
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if ((ext === "png" && !png) || (ext !== "png" && !jpeg)) throw new Error("The image content does not match its filename.");
      const { width, height } = imageDimensions(bytes);
      if (!width || !height || width > 12000 || height > 12000 || width * height > 40000000) throw new Error("Use images up to 40 megapixels and 12,000 pixels per side.");
      pixels += width * height;
      if (pixels > 60000000) throw new Error("Selected images must total at most 60 megapixels.");
    }
  }
}
