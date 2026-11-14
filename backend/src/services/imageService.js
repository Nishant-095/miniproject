import path from "node:path";
import sharp from "sharp";
import { httpError } from "../utils/httpError.js";
export async function processImage(file, body, job) {
  // Validates options and compresses or resizes an image.
  if (!file) throw httpError(400, "Choose a JPG or PNG image.");
  const format = body.format || "jpeg";
  if (!["jpeg", "png", "webp"].includes(format))
    throw httpError(400, "Choose JPEG, PNG, or WebP.");
  const quality = Number(body.quality ?? 80);
  if (!Number.isInteger(quality) || quality < 10 || quality > 100)
    throw httpError(400, "Quality must be 10–100.");
  const dimensions = {};
  for (const key of ["width", "height"]) {
    if (body[key] === undefined || body[key] === "") continue;
    const value = Number(body[key]);
    if (!Number.isInteger(value) || value < 1 || value > 6000)
      throw httpError(400, "Dimensions must be whole pixels from 1 to 6,000.");
    dimensions[key] = value;
  }
  const target = path.join(
    job.outputDir,
    `image.${format === "jpeg" ? "jpg" : format}`,
  );
  let pipeline = sharp(file.path, {
    limitInputPixels: 40000000,
  }).autoOrient();
  if (Object.keys(dimensions).length)
    pipeline = pipeline.resize({
      ...dimensions,
      fit: "inside",
      withoutEnlargement: true,
    });
  // Strip metadata by default. JPEG needs a background for transparent PNG input.
  if (format === "jpeg")
    pipeline = pipeline
      .flatten({
        background: "#ffffff",
      })
      .jpeg({
        quality,
        mozjpeg: true,
      });
  if (format === "png")
    pipeline = pipeline.png({
      compressionLevel: 9,
    });
  if (format === "webp")
    pipeline = pipeline.webp({
      quality,
    });
  let info;
  try {
    info = await pipeline
      .timeout({
        seconds: 30,
      })
      .toFile(target);
  } catch {
    throw httpError(
      422,
      "This image could not be processed. Try a smaller JPG or PNG.",
    );
  }
  if (job.controller.signal.aborted)
    throw httpError(400, "The request was cancelled.");
  return {
    target,
    width: info.width,
    height: info.height,
    size: info.size,
    format,
  };
}
