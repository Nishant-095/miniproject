import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_FILE_SIZE,
  MAX_BATCH_SIZE,
  uploadSizeError,
} from "../utils/files.js";

test("upload size validation accepts 80 MB and rejects excess bytes for files and batches", () => {
  const mb = 1024 * 1024;
  assert.equal(MAX_FILE_SIZE, 80 * mb);
  assert.equal(MAX_BATCH_SIZE, 80 * mb);
  assert.equal(uploadSizeError([{ size: 80 * mb }]), "");
  assert.equal(uploadSizeError([{ size: 40 * mb }, { size: 40 * mb }]), "");
  assert.match(uploadSizeError([{ size: 80 * mb + 1 }]), /Each file.*80 MB/);
  assert.match(
    uploadSizeError([{ size: 40 * mb }, { size: 40 * mb + 1 }]),
    /total 80 MB/,
  );
});
