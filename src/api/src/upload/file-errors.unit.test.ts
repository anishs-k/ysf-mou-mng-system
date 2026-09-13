/**
 * Purpose: Unit tests for the file-read error classification used by every
 * download route. The property that matters is narrow but load-bearing: only
 * ENOENT may be reported to a client as "the file is missing". A permission
 * error, a directory-in-place-of-file, or a disk fault must NOT be disguised
 * as a 404, because that hides an infrastructure problem behind a message
 * that tells the user to re-upload a file that is actually still there.
 *
 * The non-ENOENT cases are asserted against synthetic error objects rather
 * than real filesystem faults: EACCES and EISDIR cannot be provoked portably
 * (Windows and Linux disagree, and a test running as root sees neither), so
 * the classifier is tested directly on the shape it actually inspects.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { isFileNotFoundError, readFileOrThrowMissing } from "./file-errors.ts";

test("isFileNotFoundError is true only for ENOENT", () => {
  assert.equal(isFileNotFoundError({ code: "ENOENT" }), true);
});

test("isFileNotFoundError is false for other filesystem error codes", () => {
  // Each of these is a real fault that must surface as a 500, not a 404.
  assert.equal(isFileNotFoundError({ code: "EACCES" }), false);
  assert.equal(isFileNotFoundError({ code: "EISDIR" }), false);
  assert.equal(isFileNotFoundError({ code: "EPERM" }), false);
  assert.equal(isFileNotFoundError({ code: "EIO" }), false);
});

test("isFileNotFoundError is false for values that are not error-like", () => {
  assert.equal(isFileNotFoundError(undefined), false);
  assert.equal(isFileNotFoundError(null), false);
  assert.equal(isFileNotFoundError("ENOENT"), false);
  assert.equal(isFileNotFoundError(new Error("ENOENT")), false);
  assert.equal(isFileNotFoundError({}), false);
  assert.equal(isFileNotFoundError({ code: 2 }), false);
});

test("readFileOrThrowMissing returns the bytes of a file that exists", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mou-file-errors-"));
  try {
    const filePath = path.join(directory, "present.pdf");
    await fs.writeFile(filePath, Buffer.from("%PDF-1.4\n"));

    const buffer = await readFileOrThrowMissing(filePath);
    assert.notEqual(buffer, undefined);
    assert.equal(buffer?.subarray(0, 5).toString("latin1"), "%PDF-");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("readFileOrThrowMissing returns undefined for a missing file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mou-file-errors-"));
  try {
    const buffer = await readFileOrThrowMissing(path.join(directory, "absent.pdf"));
    assert.equal(buffer, undefined);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("readFileOrThrowMissing rethrows a non-ENOENT error instead of reporting it as missing", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mou-file-errors-"));
  try {
    // Reading a directory is the one non-ENOENT fault that is portable across
    // platforms: Linux raises EISDIR, Windows raises EISDIR or EPERM. Either
    // way it must not be swallowed into "the file is missing".
    await assert.rejects(
      () => readFileOrThrowMissing(directory),
      (error: unknown) => !isFileNotFoundError(error),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
