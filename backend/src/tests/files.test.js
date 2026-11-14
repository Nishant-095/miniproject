import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import yauzl from "yauzl";

// File tools are public and can be tested without MongoDB. All storage is isolated.
const storage = await fs.mkdtemp(
  path.join(os.tmpdir(), "utilityhub-files-test-"),
);
process.env.FILE_STORAGE_ROOT = storage;
process.env.CLIENT_URL = "http://localhost:5173";
const { default: app } = await import("../app.js");
const { cleanExpiredFiles, createJob, cleanJob } =
  await import("../services/tempFileService.js");
const fixtures = new URL("./fixtures/", import.meta.url);
let server;
let base;
let pdfA;
let pdfB;
let threePages;
let imagePdf;

async function samplePdf(labels, widths = []) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  labels.forEach((label, index) =>
    document
      .addPage([widths[index] || 595, 842])
      .drawText(label, { x: 35, y: 750, size: 15, font }),
  );
  return Buffer.from(await document.save());
}
function multipart(files = [], fields = {}, many = false) {
  const body = new FormData();
  for (const item of files)
    body.append(
      many ? "files" : "file",
      new Blob([item.bytes], { type: item.type || "application/pdf" }),
      item.name,
    );
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return body;
}
async function post(route, body, json = false) {
  const response = await fetch(`${base}?action=${route}`, {
    method: "POST",
    body: json ? JSON.stringify(body) : body,
    signal: AbortSignal.timeout(60000),
    headers: {
      Origin: "http://localhost:5173",
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const data = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? JSON.parse(bytes.toString())
    : null;
  return { response, bytes, data };
}
async function expectClean() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const entries = await Promise.all(
      ["uploads", "outputs"].map((folder) =>
        fs.readdir(path.join(storage, folder)).catch(() => []),
      ),
    );
    if (entries.flat().length === 0) return;
    await delay(10);
  }
  assert.fail("A request left temporary uploads or output files behind.");
}
async function extractedText(bytes) {
  const parser = new PDFParse({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
  });
  try {
    return (await parser.getText()).pages.map((page) => page.text);
  } finally {
    await parser.destroy();
  }
}
function documentXml(bytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      zip.on("error", reject);
      zip.on("entry", (entry) => {
        if (entry.fileName !== "word/document.xml") return zip.readEntry();
        zip.openReadStream(entry, (err, stream) => {
          if (err) return reject(err);
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            zip.close();
            resolve(Buffer.concat(chunks).toString());
          });
        });
      });
      zip.on("end", () => reject(new Error("No document.xml in DOCX.")));
      zip.readEntry();
    });
  });
}

before(async () => {
  [pdfA, pdfB, threePages] = await Promise.all([
    samplePdf(["FIRST document"], [300]),
    samplePdf(["SECOND document"], [420]),
    samplePdf(
      ["Page ONE", "Page TWO <script>& quoted</script>", "Page THREE"],
      [300, 400, 500],
    ),
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/server`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.rm(storage, { recursive: true, force: true });
});

test("Phase 2 file APIs with actual downloads and native converters", async (t) => {
  await t.test(
    "dependency status is public and reports real installed programs",
    async () => {
      const response = await fetch(`${base}?action=programStatus`, {
        method: "POST",
      });
      assert.equal(response.status, 200);
      const status = await response.json();
      assert.equal(
        status.ghostscript,
        true,
        "Install Ghostscript to run the complete native integration suite.",
      );
      assert.equal(
        status.libreoffice,
        true,
        "Install LibreOffice to run the complete native integration suite.",
      );
    },
  );

  await t.test(
    "typed text becomes a readable PDF with wrapping and multiple pages",
    async () => {
      const text =
        "Café college report\n" +
        "This is a readable line of notes.\n".repeat(60) +
        "https://example.com/" +
        "longword".repeat(100) +
        "\nLAST_MARKER";
      const result = await post("textToPdf", { text }, true);
      assert.equal(result.response.status, 200, result.data?.message);
      const pdf = await PDFDocument.load(result.bytes);
      assert.ok(pdf.getPageCount() >= 2);
      const allText = (await extractedText(result.bytes)).join("\n");
      assert.match(allText, /Café college report/);
      assert.match(allText, /LAST_MARKER/);
      assert.equal(result.response.headers.get("cache-control"), "no-store");
      assert.match(
        result.response.headers.get("content-disposition"),
        /text-document.pdf/,
      );
      assert.equal(
        Number(result.response.headers.get("x-output-size")),
        result.bytes.length,
      );
      await expectClean();
    },
  );

  await t.test(
    "empty, excessive, binary-control, and unsupported text fail cleanly",
    async () => {
      for (const text of [
        "",
        { unsafe: "object" },
        "x".repeat(100001),
        "Bad\u0000text",
        "Emoji \u{1F680}",
      ]) {
        const result = await post("textToPdf", { text }, true);
        assert.equal(result.response.status, 400, result.data?.message);
        await expectClean();
      }
    },
  );

  await t.test(
    "merge preserves multipart order, page content, and sanitized downloads",
    async () => {
      const result = await post(
        "mergePdfs",
        multipart(
          [
            { name: "Second;$(echo unsafe).PDF", bytes: pdfB },
            { name: "first report.pdf", bytes: pdfA },
          ],
          {},
          true,
        ),
      );
      assert.equal(result.response.status, 200, result.data?.message);
      const pdf = await PDFDocument.load(result.bytes);
      assert.deepEqual(
        pdf.getPages().map((page) => page.getWidth()),
        [420, 300],
      );
      const text = await extractedText(result.bytes);
      assert.match(text[0], /SECOND/);
      assert.match(text[1], /FIRST/);
      assert.match(
        result.response.headers.get("content-disposition"),
        /merged.pdf/,
      );
      await expectClean();
    },
  );

  await t.test(
    "split respects range order and removes duplicate page selections",
    async () => {
      const result = await post(
        "splitPdf",
        multipart([{ name: "three.pdf", bytes: threePages }], {
          ranges: "3, 1-2, 3",
        }),
      );
      assert.equal(result.response.status, 200, result.data?.message);
      assert.deepEqual(
        (await PDFDocument.load(result.bytes))
          .getPages()
          .map((page) => page.getWidth()),
        [500, 300, 400],
      );
      await expectClean();
    },
  );

  await t.test(
    "invalid ranges are rejected and uploads are deleted",
    async () => {
      for (const ranges of ["0", "2-1", "4", "1,,2", "banana", ""]) {
        const result = await post(
          "splitPdf",
          multipart([{ name: "three.pdf", bytes: threePages }], { ranges }),
        );
        assert.equal(result.response.status, 400, result.data?.message);
        await expectClean();
      }
    },
  );

  await t.test(
    "JPG and PNG become fitted A4 pages in the selected image order",
    async () => {
      const result = await post(
        "imagesToPdf",
        multipart(
          [
            {
              name: "portrait.png",
              bytes: await fs.readFile(new URL("sample.png", fixtures)),
              type: "image/png",
            },
            {
              name: "landscape.jpg",
              bytes: await fs.readFile(new URL("sample.jpg", fixtures)),
              type: "image/jpeg",
            },
          ],
          {},
          true,
        ),
      );
      assert.equal(result.response.status, 200, result.data?.message);
      const pdf = await PDFDocument.load(result.bytes);
      assert.equal(pdf.getPageCount(), 2);
      assert.ok(pdf.getPage(0).getWidth() < pdf.getPage(0).getHeight());
      assert.ok(pdf.getPage(1).getWidth() > pdf.getPage(1).getHeight());
      imagePdf = result.bytes;
      await expectClean();
    },
  );

  await t.test(
    "all Ghostscript compression levels return truthful sizes and valid PDFs",
    async () => {
      // Trailing PDF comments are valid and intentionally make this fixture inefficient.
      const padded = Buffer.concat([
        pdfA,
        Buffer.from("\n% compression fixture padding\n".repeat(12000)),
      ]);
      for (const level of ["low", "medium", "high"]) {
        const result = await post(
          "compressPdf",
          multipart([{ name: "report.pdf", bytes: padded }], { level }),
        );
        assert.equal(result.response.status, 200, result.data?.message);
        assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1);
        assert.equal(
          Number(result.response.headers.get("x-original-size")),
          padded.length,
        );
        assert.equal(
          Number(result.response.headers.get("x-compressed-size")),
          result.bytes.length,
        );
        assert.ok(result.bytes.length < padded.length);
        const saved = Number(result.response.headers.get("x-saved-percent"));
        assert.ok(
          Math.abs(
            saved -
              ((padded.length - result.bytes.length) / padded.length) * 100,
          ) < 0.02,
        );
        assert.match((await extractedText(result.bytes))[0], /FIRST/);
        assert.match(
          result.response.headers.get("access-control-expose-headers"),
          /X-Saved-Percent/i,
        );
        await expectClean();
      }
    },
  );

  await t.test(
    "compression keeps the original when processing would enlarge it",
    async () => {
      const result = await post(
        "compressPdf",
        multipart([{ name: "tiny.pdf", bytes: pdfA }], { level: "medium" }),
      );
      assert.equal(result.response.status, 200, result.data?.message);
      assert.ok(result.bytes.length <= pdfA.length);
      if (result.response.headers.get("x-compression-result") === "unchanged") {
        assert.deepEqual(result.bytes, pdfA);
        assert.equal(Number(result.response.headers.get("x-saved-percent")), 0);
      }
      await expectClean();
    },
  );

  await t.test(
    "DOCX with a long, spaced filename converts through real LibreOffice",
    async () => {
      const result = await post(
        "convertDocument",
        multipart(
          [
            {
              name: `college report (final) ${"x".repeat(110)}.DOCX`,
              bytes: await fs.readFile(new URL("sample.docx", fixtures)),
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
          ],
          { format: "pdf" },
        ),
      );
      assert.equal(result.response.status, 200, result.data?.message);
      assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 2);
      const text = (await extractedText(result.bytes)).join("\n");
      assert.match(text, /UtilityHub College Report/);
      assert.match(text, /second report page/);
      await expectClean();
    },
  );

  await t.test(
    "PDF to DOCX contains real editable text, and converts back to a readable PDF",
    async () => {
      const result = await post(
        "convertDocument",
        multipart([{ name: "source.pdf", bytes: threePages }], {
          format: "docx",
        }),
      );
      assert.equal(result.response.status, 200, result.data?.message);
      const xml = await documentXml(result.bytes);
      for (const word of ["ONE", "TWO", "THREE"])
        assert.match(xml, new RegExp(word));
      assert.doesNotMatch(xml, /%PDF-/);
      assert.match(xml, /&lt;script&gt;/);
      const back = await post(
        "convertDocument",
        multipart(
          [
            {
              name: "roundtrip.docx",
              bytes: result.bytes,
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
          ],
          { format: "pdf" },
        ),
      );
      assert.equal(back.response.status, 200, back.data?.message);
      const text = (await extractedText(back.bytes)).join("\n");
      for (const word of ["ONE", "TWO", "THREE"])
        assert.match(text, new RegExp(word));
      await expectClean();
    },
  );

  await t.test(
    "image-only PDFs retain their image without inventing editable text",
    async () => {
      const result = await post(
        "convertDocument",
        multipart([{ name: "scanned.pdf", bytes: imagePdf }], {
          format: "docx",
        }),
      );
      assert.equal(result.response.status, 200, result.data?.message);
      const xml = await documentXml(result.bytes);
      assert.match(xml, /<pic:pic[ >]/);
      assert.doesNotMatch(xml, /<w:t[ >]/);
      await expectClean();
    },
  );

  await t.test(
    "UTF-8 TXT and JPG conversion work without LibreOffice",
    async () => {
      const original = process.env.SOFFICE_BIN;
      process.env.SOFFICE_BIN = "/missing/utilityhub-soffice";
      try {
        const txt = await post(
          "convertDocument",
          multipart(
            [
              {
                name: "notes.txt",
                bytes: Buffer.from("Café notes\nA useful document."),
                type: "text/plain",
              },
            ],
            { format: "pdf" },
          ),
        );
        assert.equal(txt.response.status, 200, txt.data?.message);
        assert.match((await extractedText(txt.bytes))[0], /Café notes/);
        const image = await post(
          "convertDocument",
          multipart(
            [
              {
                name: "photo.jpg",
                bytes: await fs.readFile(new URL("sample.jpg", fixtures)),
                type: "image/jpeg",
              },
            ],
            { format: "pdf" },
          ),
        );
        assert.equal(image.response.status, 200, image.data?.message);
        assert.equal((await PDFDocument.load(image.bytes)).getPageCount(), 1);
      } finally {
        if (original === undefined) delete process.env.SOFFICE_BIN;
        else process.env.SOFFICE_BIN = original;
      }
      await expectClean();
    },
  );

  await t.test(
    "unavailable native programs return 503 and clean up",
    async () => {
      const settings = {
        GHOSTSCRIPT_BIN: process.env.GHOSTSCRIPT_BIN,
        SOFFICE_BIN: process.env.SOFFICE_BIN,
      };
      process.env.GHOSTSCRIPT_BIN = "/missing/utilityhub-gs";
      process.env.SOFFICE_BIN = "/missing/utilityhub-soffice";
      try {
        const gs = await post(
          "compressPdf",
          multipart([{ name: "one.pdf", bytes: pdfA }]),
        );
        assert.equal(gs.response.status, 503, gs.data?.message);
        const office = await post(
          "convertDocument",
          multipart(
            [
              {
                name: "one.docx",
                bytes: await fs.readFile(new URL("sample.docx", fixtures)),
                type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              },
            ],
            { format: "pdf" },
          ),
        );
        assert.equal(office.response.status, 503, office.data?.message);
      } finally {
        for (const [key, value] of Object.entries(settings)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
      await expectClean();
    },
  );

  await t.test(
    "missing files, invalid formats, and invalid compression levels fail cleanly",
    async () => {
      for (const [route, body, expected] of [
        [
          "mergePdfs",
          multipart([{ name: "one.pdf", bytes: pdfA }], {}, true),
          400,
        ],
        ["splitPdf", multipart([], { ranges: "1" }), 400],
        [
          "compressPdf",
          multipart([{ name: "one.pdf", bytes: pdfA }], { level: "extreme" }),
          400,
        ],
        [
          "convertDocument",
          multipart([{ name: "one.pdf", bytes: pdfA }], { format: "exe" }),
          400,
        ],
        [
          "convertDocument",
          multipart([{ name: "one.pdf", bytes: pdfA }], { format: "pdf" }),
          415,
        ],
      ]) {
        const result = await post(route, body);
        assert.equal(result.response.status, expected, result.data?.message);
        await expectClean();
      }
    },
  );

  await t.test(
    "spoofed extensions, MIME types, damaged PDFs, and invalid DOCX are rejected",
    async () => {
      for (const [name, bytes, type, route, fields, expected] of [
        [
          "fake.pdf",
          Buffer.from("not a PDF"),
          "application/pdf",
          "splitPdf",
          { ranges: "1" },
          415,
        ],
        ["fake.pdf", pdfA, "image/png", "splitPdf", { ranges: "1" }, 415],
        [
          "fake.jpg",
          await fs.readFile(new URL("sample.png", fixtures)),
          "image/jpeg",
          "convertDocument",
          { format: "pdf" },
          415,
        ],
        [
          "bad.pdf",
          Buffer.from("%PDF-1.7 broken"),
          "application/pdf",
          "splitPdf",
          { ranges: "1" },
          422,
        ],
        [
          "fake.docx",
          Buffer.from("PK not a document"),
          "application/zip",
          "convertDocument",
          { format: "pdf" },
          415,
        ],
        [
          "binary.txt",
          Buffer.from([0, 1, 2, 3]),
          "text/plain",
          "convertDocument",
          { format: "pdf" },
          415,
        ],
      ]) {
        const result = await post(
          route,
          multipart([{ name, bytes, type }], fields),
        );
        assert.equal(result.response.status, expected, result.data?.message);
        await expectClean();
      }
    },
  );

  await t.test(
    "an exact 80 MB PDF is accepted, processed, and cleaned up",
    async () => {
      const large = Buffer.alloc(80 * 1024 * 1024, 32);
      pdfA.copy(large);
      const result = await post(
        "splitPdf",
        multipart([{ name: "80mb.pdf", bytes: large }], { ranges: "1" }),
      );
      assert.equal(result.response.status, 200, result.data?.message);
      assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1);
      assert.match(
        (await extractedText(result.bytes)).join(" "),
        /FIRST document/,
      );
      await expectClean();
    },
  );

  await t.test(
    "multi-file uploads accept exactly 80 MB total and reject one byte more",
    async () => {
      const first = Buffer.alloc(40 * 1024 * 1024, 32);
      const second = Buffer.alloc(40 * 1024 * 1024, 32);
      pdfA.copy(first);
      pdfB.copy(second);
      const accepted = await post(
        "mergePdfs",
        multipart(
          [
            { name: "first.pdf", bytes: first },
            { name: "second.pdf", bytes: second },
          ],
          {},
          true,
        ),
      );
      assert.equal(accepted.response.status, 200, accepted.data?.message);
      assert.equal((await PDFDocument.load(accepted.bytes)).getPageCount(), 2);
      const text = await extractedText(accepted.bytes);
      assert.match(text[0], /FIRST document/);
      assert.match(text[1], /SECOND document/);
      await expectClean();
      const rejected = await post(
        "mergePdfs",
        multipart(
          [
            { name: "first.pdf", bytes: first },
            {
              name: "second.pdf",
              bytes: Buffer.concat([second, Buffer.from(" ")]),
            },
          ],
          {},
          true,
        ),
      );
      assert.equal(rejected.response.status, 413, rejected.data?.message);
      assert.match(rejected.data.message, /total 80 MB/);
      await expectClean();
    },
  );

  await t.test(
    "80 MB per-file and 10-file limits are enforced with cleanup",
    async () => {
      const large = Buffer.alloc(80 * 1024 * 1024 + 1, 32);
      pdfA.copy(large);
      const oversized = await post(
        "splitPdf",
        multipart([{ name: "large.pdf", bytes: large }], { ranges: "1" }),
      );
      assert.equal(oversized.response.status, 413, oversized.data?.message);
      await expectClean();
      const tooMany = await post(
        "mergePdfs",
        multipart(
          Array.from({ length: 11 }, (_, index) => ({
            name: `${index}.pdf`,
            bytes: pdfA,
          })),
          {},
          true,
        ),
      );
      assert.equal(tooMany.response.status, 400, tooMany.data?.message);
      await expectClean();
    },
  );

  await t.test(
    "stale folders are swept after a restart while recent jobs are retained",
    async () => {
      await expectClean();
      const old = randomUUID();
      const recent = randomUUID();
      for (const folder of ["uploads", "outputs"]) {
        const basePath = path.join(storage, folder);
        await fs.mkdir(path.join(basePath, old));
        await fs.writeFile(path.join(basePath, old, "leftover.pdf"), "test");
        await fs.utimes(path.join(basePath, old), new Date(0), new Date(0));
        await fs.mkdir(path.join(basePath, recent));
        await fs.writeFile(path.join(basePath, ".gitkeep"), "");
      }
      await cleanExpiredFiles();
      for (const folder of ["uploads", "outputs"]) {
        await assert.rejects(fs.access(path.join(storage, folder, old)));
        await fs.access(path.join(storage, folder, recent));
        await fs.access(path.join(storage, folder, ".gitkeep"));
        await fs.rm(path.join(storage, folder, recent), { recursive: true });
        await fs.rm(path.join(storage, folder, ".gitkeep"));
      }
      await expectClean();
    },
  );

  await t.test(
    "only three heavy jobs may run together, and their slots are released",
    async () => {
      const jobs = [];
      try {
        for (let index = 0; index < 3; index += 1) jobs.push(await createJob());
        await assert.rejects(createJob(), (error) => error.status === 503);
      } finally {
        await Promise.all(jobs.map(cleanJob));
      }
      const next = await createJob();
      await cleanJob(next);
      await expectClean();
    },
  );
});
