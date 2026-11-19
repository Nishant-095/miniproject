import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "utilityhub-no-uploads-"));
process.env.FILE_STORAGE_ROOT = directory;
const { default: app } = await import("../app.js");
let server, base;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });

test("every former file API rejects documents without creating upload/output folders", async () => {
  for (const action of ["compressPdf", "mergePdfs", "splitPdf", "imagesToPdf", "textToPdf", "convertDocument", "processImage"]) {
    const body = new FormData(); body.append("file", new Blob(["private synthetic content"]), "private.pdf");
    const response = await fetch(`${base}/server?action=${action}`, { method: "POST", body });
    assert.equal(response.status, 410, action);
    assert.equal((await response.json()).code, "CLIENT_ONLY_FILES");
  }
  assert.deepEqual(await fs.readdir(directory), []);
});

test("file actions are rejected before parsing oversized or malformed JSON", async () => {
  const response = await fetch(`${base}/server?action=textToPdf`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "private text ".repeat(100000),
  });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "CLIENT_ONLY_FILES");
  assert.deepEqual(await fs.readdir(directory), []);
});

test("multipart data cannot be smuggled through a private account action", async () => {
  const body = new FormData(); body.append("attachment", new Blob(["private note"]), "note.txt");
  const response = await fetch(`${base}/server?action=createNote`, { method: "POST", body });
  assert.equal(response.status, 410);
  assert.deepEqual(await fs.readdir(directory), []);
});

test("normal account APIs remain protected and status reports client-only file tools", async () => {
  const status = await fetch(`${base}/server?action=programStatus`, { method: "POST" });
  assert.deepEqual(await status.json(), { fileProcessing: "client", uploads: false });
  const account = await fetch(`${base}/server?action=getAccount`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(account.status, 401);
  for (const file of ["/uploads/private.pdf", "/outputs/private.pdf"]) assert.equal((await fetch(`${base}${file}`)).status, 404);
});
