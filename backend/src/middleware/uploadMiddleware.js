import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_BATCH_SIZE,
} from "../config/fileConfig.js";
import { createJob, cleanJob } from "../services/tempFileService.js";
import {
  safeFilename,
  validateUploadContents,
} from "../utils/fileValidation.js";
import { httpError } from "../utils/httpError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const mimeTypes = {
  ".pdf": ["application/pdf"],
  ".jpg": ["image/jpeg", "image/pjpeg"],
  ".jpeg": ["image/jpeg", "image/pjpeg"],
  ".png": ["image/png"],
  ".txt": ["text/plain"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
};
export const prepareFileJob = asyncHandler(async (req, res, next) => {
  // Creates temporary folders for one upload job.
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_BATCH_SIZE + 1024 * 1024) {
    throw httpError(413, "The selected files must total 80 MB or less.");
  }
  req.fileJob = await createJob();
  function aborted() {
    // Cancels processing when the client disconnects.
    req.fileJob.controller.abort();
    if (!req.fileJob.processing) void cleanJob(req.fileJob);
  }
  req.once("aborted", aborted);
  res.once("close", () => {
    // Handles close events.
    if (!res.writableFinished) aborted();
  });
  if (req.aborted) return aborted();
  next();
});
export function uploadFiles(extensions, multiple = false) {
  // Configures upload limits and content validation.
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, callback) =>
        // Chooses this job's isolated upload folder.
        callback(null, req.fileJob.inputDir),
      filename: (_req, file, callback) => {
        // Generates a random upload filename.
        callback(
          null,
          `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`,
        );
      },
    }),
    limits: {
      fileSize: MAX_FILE_SIZE,
      files: multiple ? MAX_FILES : 1,
      fields: 6,
      fieldSize: 4096,
      parts: MAX_FILES + 6,
    },
    fileFilter: (_req, file, callback) => {
      // Checks upload extensions and reported file types.
      const ext = path.extname(file.originalname).toLowerCase();
      if (!extensions.includes(ext)) {
        return callback(
          httpError(
            415,
            `Choose ${extensions.join(", ")} files for this tool.`,
          ),
        );
      }
      if (
        file.mimetype !== "application/octet-stream" &&
        !mimeTypes[ext]?.includes(file.mimetype)
      ) {
        return callback(
          httpError(415, "The file type does not match its extension."),
        );
      }
      file.originalname = safeFilename(file.originalname);
      callback(null, true);
    },
  });
  const parser = multiple
    ? upload.array("files", MAX_FILES)
    : upload.single("file");
  return (req, res, next) => {
    // Runs the returned operation when called.
    parser(req, res, async (error) => {
      // Validates upload contents and cleans failed jobs.
      try {
        if (error instanceof multer.MulterError) {
          throw httpError(
            error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
            error.code === "LIMIT_FILE_SIZE"
              ? "Each file must be 80 MB or smaller."
              : "Check the file fields, count, and form values. Upload at most 10 files.",
          );
        }
        if (error) throw error;
        await validateUploadContents(req.files || (req.file ? [req.file] : []));
        if (req.fileJob.controller.signal.aborted)
          throw httpError(400, "The upload was cancelled.");
        req.fileJob.processing = true;
        next();
      } catch (err) {
        await cleanJob(req.fileJob);
        next(err);
      }
    });
  };
}
