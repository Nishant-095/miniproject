import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export async function preparePdfAssets() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const require = createRequire(path.join(root, "package.json"));
  const source = path.dirname(require.resolve("pdfjs-dist/package.json"));
  for (const directory of ["standard_fonts", "cmaps", "wasm"]) {
    await fs.cp(path.join(source, directory), path.join(root, "public/pdfjs", directory), { recursive: true });
  }
}
