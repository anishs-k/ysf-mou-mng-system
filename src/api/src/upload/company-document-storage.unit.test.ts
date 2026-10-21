/**
 * Purpose: Unit tests for the SPEC-23 §3.2 company-document file rules: the
 * type is proved by the file's first bytes (PDF, JPEG or PNG), never by the
 * browser's claim or the filename, and the stored path is built from ids only.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { companyDocumentRelativePath, detectCompanyDocumentFile } from "./company-document-storage.ts";

const PDF = Buffer.from("%PDF-1.7\n...");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

test("a PDF is recognised by its %PDF header", () => {
  assert.deepEqual(detectCompanyDocumentFile(PDF), { mimeType: "application/pdf", extension: "pdf" });
});

test("a JPEG is recognised by FF D8 FF", () => {
  assert.deepEqual(detectCompanyDocumentFile(JPEG), { mimeType: "image/jpeg", extension: "jpg" });
});

test("a PNG is recognised by its 8-byte signature", () => {
  assert.deepEqual(detectCompanyDocumentFile(PNG), { mimeType: "image/png", extension: "png" });
});

test("AC7 a .docx renamed to .pdf is refused - its bytes are a zip", () => {
  assert.equal(detectCompanyDocumentFile(DOCX), undefined);
});

test("an empty or truncated file is refused", () => {
  assert.equal(detectCompanyDocumentFile(Buffer.alloc(0)), undefined);
  assert.equal(detectCompanyDocumentFile(Buffer.from([0xff, 0xd8])), undefined);
});

test("the stored path is built from the company and document ids only", () => {
  assert.equal(
    companyDocumentRelativePath("c1", "d1", "png").split(/[\\/]/).join("/"),
    "company/c1/d1.png",
  );
});
