import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import yauzl from "yauzl";
import { validatePdfTextLength, MAX_PDF_TEXT_CHARACTERS } from "../utils/documentLayout.js";
const storage=await fs.mkdtemp(path.join(os.tmpdir(),"utilityhub-large-document-test-"));
process.env.FILE_STORAGE_ROOT=storage;
const {createJob,cleanJob}=await import("../services/tempFileService.js");
const {convertDocument}=await import("../services/fileService.js");
after(()=>fs.rm(storage,{recursive:true,force:true}));
function documentXml(buffer){return new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);zip.on("error",reject);zip.on("entry",entry=>{if(entry.fileName!=="word/document.xml")return zip.readEntry();zip.openReadStream(entry,(err,stream)=>{if(err)return reject(err);const chunks=[];stream.on("data",x=>chunks.push(x));stream.on("error",reject);stream.on("end",()=>{zip.close();resolve(Buffer.concat(chunks).toString());});});});zip.on("end",()=>reject(new Error("Missing Word document")));zip.readEntry();}));}
test("shared online/offline text limit accepts 10 million characters and rejects more",()=>{
  assert.doesNotThrow(()=>validatePdfTextLength([{text:"x".repeat(600000)}]));
  assert.doesNotThrow(()=>validatePdfTextLength([{text:"x".repeat(MAX_PDF_TEXT_CHARACTERS)}]));
  assert.throws(()=>validatePdfTextLength([{text:"x".repeat(MAX_PDF_TEXT_CHARACTERS)},{text:"x"}]),/10 million text characters/);
});
test("a large PDF above the former 500,000-character ceiling converts without truncation",async()=>{
  const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
  const line="A sufficiently long synthetic analysis paragraph checks that all document text survives conversion.";
  for(let i=0;i<100;i++){
    const page=pdf.addPage([595,842]);
    page.drawText(`${i===0?'FIRST_LARGE_DOC_MARKER':i===99?'LAST_LARGE_DOC_MARKER':`Page ${i+1}`}\n${(line+'\n').repeat(60)}`,{x:30,y:800,font,size:7,lineHeight:11});
  }
  const bytes=await pdf.save();const source=path.join(storage,"large.pdf");await fs.writeFile(source,bytes);
  const parser=new PDFParse({data:new Uint8Array(bytes)});
  try{assert((await parser.getText()).text.length>500000);}finally{await parser.destroy();}
  const job=await createJob();
  try{const target=await convertDocument({path:source,filename:"large.pdf"},"docx",job);const xml=await documentXml(await fs.readFile(target));assert.match(xml,/FIRST_LARGE_DOC_MARKER/);assert.match(xml,/LAST_LARGE_DOC_MARKER/);assert.equal((xml.match(/<w:sectPr>/g)||[]).length,100);}
  finally{await cleanJob(job);}
});
