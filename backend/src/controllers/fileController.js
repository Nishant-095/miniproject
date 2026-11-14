import { processImage } from "../services/imageService.js";
import { cleanJob } from "../services/tempFileService.js";
import {
  compressPdf,
  convertDocument,
  imagesToPdf,
  mergePdfs,
  sendOutput,
  splitPdf,
  textToPdf,
} from "../services/fileService.js";
import { getProgramStatus } from "../services/programService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
function fileAction(action) {
  // Runs file processing and guarantees job cleanup.
  return asyncHandler(async (req, res) => {
    // Runs processing and always removes job files.
    req.fileJob.processing = true;
    try {
      await action(req, res);
    } finally {
      await cleanJob(req.fileJob);
    }
  });
}
function requiredFile(req) {
  // Requires a selected upload before processing.
  if (!req.file) throw httpError(400, "Choose a file to continue.");
  return req.file;
}
export const status = asyncHandler(async (_req, res) => {
  // Reports document converter availability.
  res.json(await getProgramStatus());
});
export const merge = fileAction(async (req, res) => {
  // Merges the uploaded PDFs in order.
  if (req.files?.length < 2 || !req.files)
    throw httpError(400, "Choose at least two PDF files.");
  const target = await mergePdfs(req.files, req.fileJob);
  await sendOutput(req, res, target, "merged.pdf");
});
export const makeFromImages = fileAction(async (req, res) => {
  // Creates PDF pages from uploaded images.
  if (!req.files?.length)
    throw httpError(400, "Choose at least one JPG or PNG.");
  const target = await imagesToPdf(req.files, req.fileJob);
  await sendOutput(req, res, target, "images.pdf");
});
export const makeFromText = fileAction(async (req, res) => {
  // Creates a PDF from submitted text.
  const target = await textToPdf(req.body?.text, req.fileJob);
  await sendOutput(req, res, target, "text-document.pdf");
});
export const split = fileAction(async (req, res) => {
  // Extracts the selected PDF pages.
  const target = await splitPdf(
    requiredFile(req),
    req.body?.ranges,
    req.fileJob,
  );
  await sendOutput(req, res, target, "selected-pages.pdf");
});
export const compress = fileAction(async (req, res) => {
  // Compresses the PDF and returns size statistics.
  const result = await compressPdf(
    requiredFile(req),
    req.body?.level || "medium",
    req.fileJob,
  );
  res.set({
    "X-Original-Size": String(result.originalSize),
    "X-Compressed-Size": String(result.compressedSize),
    "X-Saved-Percent": result.savedPercent.toFixed(2),
    "X-Compression-Result": result.unchanged ? "unchanged" : "compressed",
  });
  await sendOutput(req, res, result.target, "compressed.pdf");
});
export const convert = fileAction(async (req, res) => {
  // Converts the uploaded document to its requested format.
  const format = req.body?.format;
  if (!["pdf", "docx"].includes(format))
    throw httpError(400, "Choose PDF or DOCX as the output format.");
  const target = await convertDocument(requiredFile(req), format, req.fileJob);
  await sendOutput(req, res, target, `converted.${format}`);
});
export const image = fileAction(async (req, res) => {
  // Resizes or compresses the uploaded image.
  const result = await processImage(requiredFile(req), req.body, req.fileJob);
  res.set({
    "X-Original-Size": String(req.file.size),
    "X-Compressed-Size": String(result.size),
    "X-Saved-Percent": ((1 - result.size / req.file.size) * 100).toFixed(2),
    "X-Image-Width": String(result.width),
    "X-Image-Height": String(result.height),
  });
  await sendOutput(
    req,
    res,
    result.target,
    `utilityhub-image.${result.format === "jpeg" ? "jpg" : result.format}`,
  );
});
