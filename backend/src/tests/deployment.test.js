import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("cloud health checks report an unavailable database without requiring login", async () => {
  const { default: app } = await import("../app.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable", database: "disconnected" });
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("a free cloud instance limits file processing to one job and releases its slot", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "utilityhub-cloud-"));
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", `
      import {createJob, cleanJob} from ${JSON.stringify(new URL("../services/tempFileService.js", import.meta.url).href)};
      import app from ${JSON.stringify(new URL("../app.js", import.meta.url).href)};
      const first = await createJob(); let status;
      try { await createJob(); } catch (error) { status = error.status; }
      await cleanJob(first); const next = await createJob(); await cleanJob(next);
      console.log(JSON.stringify({status, proxy: app.get("trust proxy"), released: true}));
    `], { env: { ...process.env, MAX_ACTIVE_FILE_JOBS: "1", TRUST_PROXY: "1", FILE_STORAGE_ROOT: directory } });
    assert.deepEqual(JSON.parse(stdout), { status: 503, proxy: 1, released: true });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
