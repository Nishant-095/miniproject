import { PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { imageDimensions } from "./localFilePolicy.js";

async function encodeJpeg(bytes, quality) {
  const size = imageDimensions(bytes);
  if (size.width > 12000 || size.height > 12000 || size.width * size.height > 16000000) return null;
  const image = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
  const canvas = document.createElement("canvas");
  try {
    canvas.width = image.width; canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && new Uint8Array(await blob.arrayBuffer());
  } finally { image.close(); canvas.width = 1; canvas.height = 1; }
}

// Preserve text, vectors, page geometry and unsupported image types exactly.
// Quality affects ordinary RGB JPEG images; structural optimization is lossless.
export async function compressLocalPdf(pdf, level = "medium", { signal, reencode = encodeJpeg } = {}) {
  const quality = { low: 0.88, medium: 0.68, high: 0.45 }[level];
  if (!quality) throw new Error("Choose low, medium or high compression.");
  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    if (dict.get(PDFName.of("Subtype"))?.toString() !== "/Image" ||
        dict.get(PDFName.of("Filter"))?.toString() !== "/DCTDecode" ||
        dict.get(PDFName.of("ColorSpace"))?.toString() !== "/DeviceRGB" ||
        dict.get(PDFName.of("BitsPerComponent"))?.asNumber?.() !== 8 ||
        ["Decode", "SMask", "Mask", "ImageMask", "DecodeParms"].some(key => dict.has(PDFName.of(key)))) continue;
    const width = dict.get(PDFName.of("Width"))?.asNumber?.(), height = dict.get(PDFName.of("Height"))?.asNumber?.();
    if (!width || !height || width * height > 16000000) continue;
    // Recompressing a single JPEG can fail in a browser; keep that image intact.
    let bytes;
    try { bytes = await reencode(object.contents, quality); } catch { continue; }
    if (!bytes || bytes.length >= object.contents.length) continue;
    const copy = dict.clone(pdf.context);
    copy.set(PDFName.of("Length"), PDFNumber.of(bytes.length));
    pdf.context.assign(ref, PDFRawStream.of(copy, bytes));
  }
  return pdf.save({ useObjectStreams: true });
}
