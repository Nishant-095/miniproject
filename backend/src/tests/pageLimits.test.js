import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { processOfflineFile } from "../../../frontend/src/services/offlineFiles.js";
const storage = await fs.mkdtemp(path.join(os.tmpdir(), "utilityhub-page-limit-"));
process.env.FILE_STORAGE_ROOT = storage;
const { readPdf, mergePdfs } = await import("../services/fileService.js");
const { createJob, cleanJob } = await import("../services/tempFileService.js");
async function source(pages) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([100,100]);
  const bytes = await pdf.save();
  const target = path.join(storage, `${pages}.pdf`);
  await fs.writeFile(target,bytes);
  return { path: target, filename: `${pages}.pdf`, bytes };
}
const [thousand, tooMany, half, overHalf] = await Promise.all([source(1000),source(1001),source(500),source(501)]);
after(()=>fs.rm(storage,{recursive:true,force:true}));
test("server accepts 1,000-page PDFs and rejects 1,001 pages",async()=>{
  assert.equal((await readPdf(thousand.path)).getPageCount(),1000);
  await assert.rejects(readPdf(tooMany.path), error=>error.status===413 && /1000/.test(error.message));
});
test("server merge permits exactly 1,000 combined pages",async()=>{
  const job=await createJob();
  try {
    const target=await mergePdfs([half,half],job);
    assert.equal((await readPdf(target)).getPageCount(),1000);
    await assert.rejects(mergePdfs([half,overHalf],job),/at most 1000 pages/);
  } finally {await cleanJob(job);}
});
test("offline splitter accepts page 1,000 and gives a page-limit error for 1,001",async()=>{
  const form=new FormData();form.append("file",new File([thousand.bytes],"thousand.pdf"));form.append("ranges","1000");
  const output=await processOfflineFile("splitPdf",form);
  assert.equal((await PDFDocument.load(await output.data.arrayBuffer())).getPageCount(),1);
  form.set("file",new File([tooMany.bytes],"too-many.pdf"));
  await assert.rejects(processOfflineFile("splitPdf",form),/1 to 1000 pages/);
});
test("offline merger enforces the same 1,000-page combined limit",async()=>{
  const form=new FormData();form.append("files",new File([half.bytes],"half.pdf"));form.append("files",new File([half.bytes],"half-again.pdf"));
  const output=await processOfflineFile("mergePdfs",form);
  assert.equal((await PDFDocument.load(await output.data.arrayBuffer())).getPageCount(),1000);
  form.delete("files");form.append("files",new File([half.bytes],"half.pdf"));form.append("files",new File([overHalf.bytes],"over-half.pdf"));
  await assert.rejects(processOfflineFile("mergePdfs",form),/at most 1000 pages/);
});
