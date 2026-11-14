import path from "node:path";
import { fileURLToPath } from "node:url";
const backendRoot = fileURLToPath(new URL("../../", import.meta.url));
const storageRoot = process.env.FILE_STORAGE_ROOT || backendRoot;
export const UPLOADS_DIR = path.join(storageRoot, "uploads");
export const OUTPUTS_DIR = path.join(storageRoot, "outputs");
export const MAX_FILE_SIZE = 80 * 1024 * 1024;
export const MAX_BATCH_SIZE = 80 * 1024 * 1024;
export const MAX_FILES = 10;
export const MAX_PAGES = 1000;
export const MAX_TEXT_LENGTH = 100000;
export const PROCESS_TIMEOUT = 120000;
export function ghostscriptBinary() {
  // Chooses the Ghostscript executable path.
  return (
    process.env.GHOSTSCRIPT_BIN ||
    (process.platform === "win32" ? "gswin64c.exe" : "gs")
  );
}
export function libreOfficeBinary() {
  // Chooses the LibreOffice executable path.
  return (
    process.env.SOFFICE_BIN ||
    (process.platform === "win32"
      ? "C:/Program Files/LibreOffice/program/soffice.com"
      : "soffice")
  );
}
