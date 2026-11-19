import { analyzePdfStructure, buildStructuredWord, wordTextMeasure } from "../../../backend/src/utils/pdfStructure.js";

// Shared structure analysis is bundled into the website and installed PWA.
export async function structuredPdfToWord(file, options = {}) {
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const geometry = await import("pdf-parse");
  const metrics = document.createElement("canvas").getContext("2d");
  const pages = await analyzePdfStructure(new Uint8Array(await file.arrayBuffer()), { pdfjs, geometry, loadImage: bytes => createImageBitmap(new Blob([bytes], { type: "image/png" })),
    measureText: await wordTextMeasure(item => { metrics.font = `${item.italic ? "italic " : ""}${item.bold ? "bold " : ""}${item.size}px "${item.font}"`; return metrics.measureText(item.text).width; }),
    createCanvas: (width, height) => Object.assign(document.createElement("canvas"), { width, height }),
    encodeCanvas: async canvas => {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not copy a PDF graphic. Try a smaller document.");
      return new Uint8Array(await blob.arrayBuffer());
    },
    pdfOptions: { standardFontDataUrl: `${location.origin}/pdfjs/standard_fonts/`, cMapUrl: `${location.origin}/pdfjs/cmaps/`, cMapPacked: true, wasmUrl: `${location.origin}/pdfjs/wasm/` }, ...options,
  });
  const docx = await import("docx");
  return docx.Packer.toBlob(buildStructuredWord(pages, docx));
}
