import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";
import { PDFParse } from "pdf-parse";
import yauzl from "yauzl";
import { pdfPagesToBlocks } from "../utils/documentLayout.js";
const storage = await fs.mkdtemp(path.join(os.tmpdir(), "utilityhub-table-tests-"));
process.env.FILE_STORAGE_ROOT = storage;
const { createJob, cleanJob } = await import("../services/tempFileService.js");
const { convertDocument, splitPdf, mergePdfs, compressPdf } = await import("../services/fileService.js");
const source = new URL("./fixtures/synopsis-table.pdf", import.meta.url);
const bytes = await fs.readFile(source);
async function tables(data) {
  const parser = new PDFParse({ data: new Uint8Array(data), isEvalSupported: false });
  try { return (await parser.getTable()).pages; } finally { await parser.destroy(); }
}
async function jobRun(run) { const job=await createJob();try{return await run(job);}finally{await cleanJob(job);} }
function xmlFromDocx(buffer) {
  return new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true},(error,zip)=>{
    if(error)return reject(error);zip.on("error",reject);zip.on("entry",entry=>{if(entry.fileName!=="word/document.xml")return zip.readEntry();zip.openReadStream(entry,(err,stream)=>{if(err)return reject(err);const data=[];stream.on("data",chunk=>data.push(chunk));stream.on("error",reject);stream.on("end",()=>{zip.close();resolve(Buffer.concat(data).toString());});});});zip.on("end",()=>reject(new Error("Missing Word document")));zip.readEntry();
  }));
}
after(()=>fs.rm(storage,{recursive:true,force:true}));
test("synopsis PDF becomes seven real Word tables with blank rows and a merged heading", async()=>{
  await jobRun(async job=>{
    const target=await convertDocument({path:source.pathname,filename:"synopsis.pdf"},"docx",job);
    const xml=await xmlFromDocx(await fs.readFile(target));
    assert.equal((xml.match(/<w:tbl>/g)||[]).length,7);
    assert.match(xml,/<w:gridSpan w:val="6"/);
    assert.equal((xml.match(/<w:tr>/g)||[]).length,19);
    assert.match(xml,/Name of Project Coordinator/);assert.match(xml,/Student Name/);
    assert.match(xml,/<\/w:tbl><w:p>/);
    const roundtrip=await convertDocument({path:target,filename:path.basename(target)},"pdf",job);
    const back=await tables(await fs.readFile(roundtrip));
    assert.equal(back.flatMap(p=>p.tables).length,7);
  });
});
test("split, merge and compression retain the source's vector table grids",async()=>{
  const original=await tables(bytes);
  await jobRun(async job=>{
    const file={path:source.pathname,filename:"synopsis.pdf",size:bytes.length};
    const split=await splitPdf(file,"1",job);
    assert.deepEqual((await tables(await fs.readFile(split)))[0].tables,original[0].tables);
    const merged=await mergePdfs([file,file],job);
    assert.equal((await tables(await fs.readFile(merged))).flatMap(p=>p.tables).length,14);
    const compressed=await compressPdf(file,"medium",job);
    assert.deepEqual((await tables(await fs.readFile(compressed.target))).map(p=>p.tables),original.map(p=>p.tables));
  });
});
test("empty table cells and plain text are retained without duplicate table text",()=>{
  const pages=pdfPagesToBlocks([{num:1,text:"Before\nTitle\nA\tB\nAfter"}],[{num:1,tables:[[["Title"],["A","B"],["",""]]]}]);
  assert.equal(pages[0].length,3);assert.equal(pages[0][1].rows.length,3);assert.equal(pages[0][1].rows[0][0].span,2);assert.equal(pages[0][2].text,"After");
  const empty=pdfPagesToBlocks([{num:1,text:""}],[{num:1,tables:[[["",""]]]}]);assert.equal(empty[0][0].type,"table");
});
test("ambiguous table reading order is reported instead of silently dropping cells",()=>{
  assert.throws(()=>pdfPagesToBlocks([{num:1,text:"Unrelated"}],[{num:1,tables:[[["Missing"]]]}]),/unsupported reading order/);
});
