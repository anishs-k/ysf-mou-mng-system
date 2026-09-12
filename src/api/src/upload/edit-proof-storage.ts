/**
 * Purpose: The proof file SPEC-10 section 3 requires for a "Communication
 * from HR" edit reason - PDF or image, header-checked like SPEC-05's own MOU
 * PDF, stored outside the web root. A second, small module rather than an
 * extension of upload/mou-document-storage.ts because the allowed types
 * differ (PDF *or* image, not PDF only) and the file lives under its own
 * `edit-proof/` tree, keyed by the edit-request id rather than an MOU id
 * alone - SPEC-10 section 3.1 never requires more than one proof file per
 * request, so there is no multiple-files-per-key concern SPEC-09 had to
 * solve.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { uploadRoot } from "./mou-document-storage.ts";

const ALLOWED_PROOF_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
const PDF_MAGIC_BYTES = "%PDF";
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC_BYTES = Buffer.from([0xff, 0xd8, 0xff]);

const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export interface ProofValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

/** The mimetype fails fast; the magic bytes on the actual buffer are what a
 * relabelled file cannot fake, the same reasoning as SPEC-05's %PDF check. */
export function validateProofBuffer(buffer: Buffer, mimetype: string): ProofValidationResult {
  if (!(ALLOWED_PROOF_MIME_TYPES as readonly string[]).includes(mimetype)) {
    return { valid: false, reason: "The proof file must be a PDF, PNG or JPEG" };
  }
  if (mimetype === "application/pdf") {
    if (buffer.subarray(0, PDF_MAGIC_BYTES.length).toString("latin1") !== PDF_MAGIC_BYTES) {
      return { valid: false, reason: "The file is not a valid PDF" };
    }
  } else if (mimetype === "image/png") {
    if (!buffer.subarray(0, PNG_MAGIC_BYTES.length).equals(PNG_MAGIC_BYTES)) {
      return { valid: false, reason: "The file is not a valid PNG" };
    }
  } else if (mimetype === "image/jpeg") {
    if (!buffer.subarray(0, JPEG_MAGIC_BYTES.length).equals(JPEG_MAGIC_BYTES)) {
      return { valid: false, reason: "The file is not a valid JPEG" };
    }
  }
  return { valid: true };
}

/** Writes the proof file straight to permanent storage, named by the edit
 * request's own id - the request row and the file it refers to share the
 * same key, so there is never an orphaned or ambiguous proof file. */
export async function writeEditProofFile(
  mouId: string,
  requestId: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  const extension = EXTENSION_BY_MIME_TYPE[mimetype] ?? "bin";
  const relativePath = path.join("edit-proof", mouId, `${requestId}.${extension}`);
  const absolutePath = path.join(uploadRoot(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return relativePath;
}
