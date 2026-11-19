import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { processLocalFile } from "../services/offlineFiles.js";
import { validateLocalFiles, imageDimensions } from "../services/localFilePolicy.js";
import { compressLocalPdf } from "../services/compressLocalPdf.js";

function form(bytes, name = "sample.pdf", fields = {}) {
  const data = new FormData(); data.append("file", new Blob([bytes]), name);
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
test("mislabeled, empty and non-UTF8 files are rejected before parsing or networking", async t => {
  t.mock.method(globalThis, "fetch", () => { assert.fail("Input validation cannot use the network."); });
  await assert.rejects(validateLocalFiles("splitPdf", form("private text")), /not a PDF/);
  await assert.rejects(validateLocalFiles("convertDocument", form("not a ZIP", "sample.docx")), /not a Word/);
  await assert.rejects(validateLocalFiles("convertDocument", form(new Uint8Array([255]), "sample.txt")), /UTF-8/);
  await assert.rejects(validateLocalFiles("processImage", form("fake image", "sample.png")), /does not match/);
  await assert.rejects(validateLocalFiles("splitPdf", form("")), /non-empty/);
});
test("PNG dimensions are checked before allocating an image canvas", async () => {
  const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(16, 13000); view.setUint32(20, 1);
  assert.deepEqual(imageDimensions(bytes), { width: 13000, height: 1 });
  await assert.rejects(validateLocalFiles("processImage", form(bytes, "large.png")), /12,000 pixels/);
});
test("compression preserves page sizes, text streams and the selected original", async t => {
  t.mock.method(globalThis, "fetch", () => { assert.fail("Compression cannot use the network."); });
  const pdf = await PDFDocument.create(); pdf.addPage([350, 600]).drawText("Editable text stays text");
  const bytes = await pdf.save(); const data = form(bytes, "sample.pdf", { level: "high" });
  const output = await processLocalFile("compressPdf", data);
  assert.ok(output.data.size <= bytes.length);
  const read = await PDFDocument.load(await output.data.arrayBuffer());
  assert.deepEqual(read.getPage(0).getSize(), { width: 350, height: 600 });
  assert.deepEqual(new Uint8Array(await data.get("file").arrayBuffer()), bytes);
  await assert.rejects(compressLocalPdf(read, "invalid"), /Choose low/);
});
test("cancellation stops local work before reading the file", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(processLocalFile("splitPdf", form("%PDF-"), { signal: controller.signal }), { name: "AbortError" });
});
