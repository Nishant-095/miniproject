import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  PROCESS_TIMEOUT,
  ghostscriptBinary,
  libreOfficeBinary,
} from "../config/fileConfig.js";
import { httpError } from "../utils/httpError.js";
const execFileAsync = promisify(execFile);
export async function runProgram(binary, args, name, signal) {
  // Runs a fixed native command with a timeout.
  try {
    return await execFileAsync(binary, args, {
      timeout: PROCESS_TIMEOUT,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      signal,
    });
  } catch (error) {
    if (error.code === "ENOENT")
      throw httpError(
        503,
        `${name} is not installed or its executable path is incorrect. Check backend/.env.`,
      );
    if (error.name === "AbortError")
      throw httpError(400, "The operation was cancelled.");
    if (error.killed)
      throw httpError(504, `${name} took too long. Try a smaller file.`);
    throw httpError(
      422,
      `${name} could not process this document. Check that it opens correctly and is not password-protected.`,
    );
  }
}
let cachedStatus;
let checkedAt = 0;
export async function getProgramStatus() {
  // Checks Ghostscript and LibreOffice availability.
  if (cachedStatus && Date.now() - checkedAt < 60000) return cachedStatus;
  async function available(binary) {
    // Checks whether a native executable can run.
    try {
      await execFileAsync(binary, ["--version"], {
        timeout: 10000,
        windowsHide: true,
        maxBuffer: 100000,
      });
      return true;
    } catch {
      return false;
    }
  }
  const [ghostscript, libreoffice] = await Promise.all([
    available(ghostscriptBinary()),
    available(libreOfficeBinary()),
  ]);
  cachedStatus = {
    ghostscript,
    libreoffice,
  };
  checkedAt = Date.now();
  return cachedStatus;
}
