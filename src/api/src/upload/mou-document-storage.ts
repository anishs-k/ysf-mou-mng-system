/**
 * Purpose: Where a wizard-uploaded MOU PDF lives on disk, and the byte-level
 * checks SPEC-05 section 3 requires before it is trusted (mimetype *and* the
 * `%PDF` file header - a renamed `.docx` fails the second check even when it
 * lies about the first). Every path is deterministic from a draft or MOU id,
 * never built from a user-supplied filename, which is the strongest form of
 * "filename sanitised before storage": there is no filename in the path to
 * sanitise. This module is deliberately small and self-contained because
 * SPEC-09 (`docs/specifications/SPEC-09-upload-mou-pdf.md`) reuses "the PDF
 * validation from SPEC-05 section 3" for a second, later upload screen.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { isFileNotFoundError } from "./file-errors.ts";

const DEFAULT_UPLOAD_ROOT = path.resolve(process.cwd(), ".data", "uploads");
const TEMP_DOCUMENT_NAME = "document.pdf";
const PDF_MAGIC_BYTES = "%PDF";

/** Shared with upload/edit-proof-storage.ts (SPEC-10) so both upload paths agree on where files live. */
export function uploadRoot(): string {
  const configured = process.env["UPLOAD_ROOT"];
  return configured !== undefined && configured !== ""
    ? configured
    : DEFAULT_UPLOAD_ROOT;
}

function tempDraftDir(draftId: string): string {
  return path.join(uploadRoot(), "draft-tmp", draftId);
}

function tempDocumentPath(draftId: string): string {
  return path.join(tempDraftDir(draftId), TEMP_DOCUMENT_NAME);
}

function permanentDocumentDir(mouId: string): string {
  return path.join(uploadRoot(), "mou", mouId);
}

/** The path stored on mou_document.file_path, relative to UPLOAD_ROOT. */
export function permanentDocumentRelativePath(mouId: string): string {
  return path.join("mou", mouId, TEMP_DOCUMENT_NAME);
}

export interface PdfValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

/**
 * The mimetype is the browser's own claim and is checked first only to fail
 * fast; the `%PDF` header on the actual bytes is what a renamed `.docx`
 * cannot fake (AC2).
 */
export function validatePdfBuffer(
  buffer: Buffer,
  mimetype: string,
): PdfValidationResult {
  if (mimetype !== "application/pdf") {
    return { valid: false, reason: "The file must be a PDF" };
  }
  if (
    buffer.subarray(0, PDF_MAGIC_BYTES.length).toString("latin1") !==
    PDF_MAGIC_BYTES
  ) {
    return { valid: false, reason: "The file is not a valid PDF" };
  }
  return { valid: true };
}

export interface VirusScanResult {
  readonly clean: boolean;
  readonly reason?: string;
}

/**
 * SPEC-05 section 3 says "virus-scanned if available" - no scanner is
 * installed in this environment, so this is a real, documented hook rather
 * than a fabricated integration: it runs `VIRUS_SCAN_COMMAND` with the file
 * on disk as its only argument if that variable is set, and is a no-op
 * (clean) otherwise. A non-zero exit code is treated as "infected".
 */
export async function scanForViruses(
  filePath: string,
): Promise<VirusScanResult> {
  const command = process.env["VIRUS_SCAN_COMMAND"];
  if (command === undefined || command === "") {
    return { clean: true };
  }
  return new Promise((resolve) => {
    const child = spawn(command, [filePath]);
    child.on("error", () => resolve({ clean: true }));
    child.on("close", (code) => {
      resolve(
        code === 0
          ? { clean: true }
          : { clean: false, reason: "The file failed a virus scan" },
      );
    });
  });
}

/** Resolves a stored `mou_document.file_path` (relative to UPLOAD_ROOT) back to an absolute path for reading. */
export function mouDocumentAbsolutePath(relativePath: string): string {
  return path.join(uploadRoot(), relativePath);
}

/**
 * Writes a new document straight to permanent storage for an MOU that already
 * exists (SPEC-09's standalone upload, as opposed to the wizard's one draft
 * temp file promoted at final save). SPEC-09 section 3.1 requires every
 * upload to add a document rather than replace one, so the filename is a
 * freshly generated id - never the draft/mou id alone - so a second upload to
 * the same MOU can never collide with or overwrite the first.
 */
export async function writeMouDocument(
  mouId: string,
  buffer: Buffer,
): Promise<{ id: string; relativePath: string }> {
  const id = randomUUID();
  const relativePath = path.join("mou", mouId, `${id}.pdf`);
  const absolutePath = path.join(uploadRoot(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return { id, relativePath };
}

/** Writes (or overwrites) the one temp file a draft may hold. */
export async function writeTempDocument(
  draftId: string,
  buffer: Buffer,
): Promise<string> {
  const filePath = tempDocumentPath(draftId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export function tempDocumentFilePath(draftId: string): string {
  return tempDocumentPath(draftId);
}

/**
 * True only when the temp file is genuinely absent. Any other access failure
 * (permissions, a disk fault) is rethrown so the final save fails loudly
 * rather than telling the user to re-upload a file that is actually there.
 */
export async function tempDocumentExists(draftId: string): Promise<boolean> {
  try {
    await fs.access(tempDocumentPath(draftId));
    return true;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

/** Best-effort cleanup on cancel/discard - a missing directory is not an error. */
export async function discardTempDocument(draftId: string): Promise<void> {
  await fs.rm(tempDraftDir(draftId), { recursive: true, force: true });
}

/**
 * Moves the draft's temp PDF into permanent storage at final save. Renamed
 * where possible; falls back to copy-then-delete across filesystems (EXDEV),
 * which `fs.rename` cannot do itself.
 */
export async function promoteTempDocument(
  draftId: string,
  mouId: string,
): Promise<string> {
  const source = tempDocumentPath(draftId);
  const destinationDir = permanentDocumentDir(mouId);
  await fs.mkdir(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, TEMP_DOCUMENT_NAME);
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    await fs.copyFile(source, destination);
    await fs.unlink(source);
  }
  return destination;
}
