import assert from "node:assert/strict";
import { test } from "node:test";
import { zipSync, strToU8 } from "fflate";
import { readDocxArchive } from "../services/docxLayout.js";

const archive = rel => zipSync({
  "word/document.xml": strToU8("<document/>"),
  "word/_rels/document.xml.rels": strToU8(rel),
});

test("Word layout conversion rejects linked assets instead of fetching them", () => {
  for (const type of ["image", "font", "attachedTemplate"]) {
    for (const attrs of [
      `Type="http://schemas.example/${type}" TargetMode="External"`,
      `TargetMode='External' Target='https://example.invalid/private' Type='http://schemas.example/${type}'`,
    ]) assert.throws(() => readDocxArchive(archive(`<Relationships><Relationship ${attrs}/></Relationships>`)), /external picture, font, or template/);
  }
});

test("ordinary hyperlinks do not prevent conversion; embedded pictures remain local", () => {
  const files = readDocxArchive(archive('<Relationships><Relationship Type="schema/hyperlink" TargetMode="External" Target="https://example.invalid"/><Relationship Type="schema/image" Target="media/image.png"/></Relationships>'));
  assert.ok(files["word/document.xml"]);
});

test("invalid Word archives fail before rendering", () => {
  assert.throws(() => readDocxArchive(zipSync({})), /missing its document content/);
  assert.throws(() => readDocxArchive(new Uint8Array([1,2,3])));
});
