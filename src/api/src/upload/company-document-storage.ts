/**
 * Purpose: Where a SPEC-23 company document (GST / Registration certificate)
 * lives on disk, and the byte-level proof of its type. A certificate may be a
 * PDF, JPEG or PNG, so the type is read from the file's first bytes - the
 * browser's mimetype and the filename are never trusted (SPEC-09's rule). The
 * path is built from ids only, under the same UPLOAD_ROOT as MoU documents.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { uploadRoot } from "./mou-document-storage.ts";

export interface DetectedFile {
  readonly mimeType: string;
  readonly extension: string;
}

/** Each accepted format's leading signature bytes. */
const SIGNATURES: readonly { readonly bytes: readonly number[]; readonly file: DetectedFile }[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], file: { mimeType: "application/pdf", extension: "pdf" } },
  { bytes: [0xff, 0xd8, 0xff], file: { mimeType: "image/jpeg", extension: "jpg" } },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], file: { mimeType: "image/png", extension: "png" } },
];

/** The format the bytes prove, or undefined for anything that is not a PDF, JPEG or PNG. */
export function detectCompanyDocumentFile(buffer: Buffer): DetectedFile | undefined {
  return SIGNATURES.find(({ bytes }) => buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte))?.file;
}

/** The path stored on company_document.file_path, relative to UPLOAD_ROOT. */
export function companyDocumentRelativePath(companyId: string, documentId: string, extension: string): string {
  return path.join("company", companyId, `${documentId}.${extension}`);
}

export function companyDocumentAbsolutePath(relativePath: string): string {
  return path.join(uploadRoot(), relativePath);
}

/** Writes a new file; the document id makes the name unique, so nothing is ever overwritten. */
export async function writeCompanyDocument(relativePath: string, buffer: Buffer): Promise<void> {
  const absolutePath = companyDocumentAbsolutePath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
}
