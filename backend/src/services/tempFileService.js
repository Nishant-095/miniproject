import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { UPLOADS_DIR, OUTPUTS_DIR } from "../config/fileConfig.js";
import { httpError } from "../utils/httpError.js";
const activeJobs = new Set();
// A one-minute sweep removes abandoned folders by the ten-minute mark.
const STALE_AFTER = 9 * 60 * 1000;
const jobNamePattern = /^[a-f0-9-]{36}$/;
export async function initializeFileStorage() {
  // Creates the temporary input and output folders.
  await Promise.all([
    fs.mkdir(UPLOADS_DIR, {
      recursive: true,
    }),
    fs.mkdir(OUTPUTS_DIR, {
      recursive: true,
    }),
  ]);
}
export async function createJob() {
  // Allocates isolated folders for one file job.
  if (activeJobs.size >= 3) {
    throw httpError(
      503,
      "The file tools are busy. Please try again in a moment.",
    );
  }
  const id = randomUUID();
  const job = {
    id,
    inputDir: path.join(UPLOADS_DIR, id),
    outputDir: path.join(OUTPUTS_DIR, id),
    controller: new AbortController(),
    processing: false,
  };
  activeJobs.add(id);
  try {
    await initializeFileStorage();
    await fs.mkdir(job.inputDir);
    await fs.mkdir(job.outputDir);
    return job;
  } catch (error) {
    await cleanJob(job);
    throw error;
  }
}
export async function cleanJob(job) {
  // Deletes temporary job files and releases its slot.
  if (!job) return;
  try {
    await Promise.all([
      fs.rm(job.inputDir, {
        recursive: true,
        force: true,
      }),
      fs.rm(job.outputDir, {
        recursive: true,
        force: true,
      }),
    ]);
  } catch (error) {
    console.error("Temporary file cleanup failed:", error.message);
    // The periodic sweep retries folders that could not be removed immediately.
  } finally {
    activeJobs.delete(job.id);
  }
}
export async function cleanExpiredFiles(now = Date.now()) {
  // Deletes abandoned job folders after their time limit.
  await initializeFileStorage();
  for (const base of [UPLOADS_DIR, OUTPUTS_DIR]) {
    for (const entry of await fs.readdir(base, {
      withFileTypes: true,
    })) {
      if (
        !entry.isDirectory() ||
        !jobNamePattern.test(entry.name) ||
        activeJobs.has(entry.name)
      )
        continue;
      const directory = path.join(base, entry.name);
      const info = await fs.stat(directory).catch(
        () =>
          // Handles a failed operation.
          null,
      );
      if (info && now - info.mtimeMs >= STALE_AFTER) {
        await fs.rm(directory, {
          recursive: true,
          force: true,
        });
      }
    }
  }
}
export async function startFileCleanup() {
  // Starts the periodic abandoned-file cleanup.
  await cleanExpiredFiles();
  const timer = setInterval(() => {
    // Repeats the scheduled check.
    cleanExpiredFiles().catch((error) =>
      // Handles a failed operation.
      console.error("Cleanup sweep failed:", error.message),
    );
  }, 60000);
  timer.unref();
  return () =>
    // Stops the timer when no longer needed.
    clearInterval(timer);
}
