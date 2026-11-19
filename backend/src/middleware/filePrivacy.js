const fileActions = new Set([
  "compressPdf", "mergePdfs", "splitPdf", "imagesToPdf",
  "textToPdf", "convertDocument", "processImage",
]);

// This runs before JSON parsing or multer. Old clients cannot upload files.
export function rejectFileUploads(req, res, next) {
  if (fileActions.has(req.query.action) || req.is("multipart/form-data")) {
    return res.status(410).set("Cache-Control", "no-store").json({
      message: "File tools now run only on your device. Update UtilityHub to continue; this server does not accept or process files.",
      code: "CLIENT_ONLY_FILES",
    });
  }
  next();
}
