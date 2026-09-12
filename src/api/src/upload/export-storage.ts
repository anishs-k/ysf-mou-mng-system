/**
 * Purpose: Where a generated export file lives on disk (SPEC-13 section 5) -
 * stored outside the web root under `exports/<jobId>.<ext>`, exactly like
 * every other upload in this app, reachable only through the authenticated
 * `GET /api/export/jobs/:jobId/download` endpoint (never a guessable URL),
 * and deleted by `jobs/export-cleanup.ts` 24 hours after creation.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { uploadRoot } from "./mou-document-storage.ts";

export async function writeExportFile(jobId: string, extension: string, buffer: Buffer): Promise<string> {
  const relativePath = path.join("exports", `${jobId}.${extension}`);
  const absolutePath = path.join(uploadRoot(), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return relativePath;
}

export function exportFileAbsolutePath(relativePath: string): string {
  return path.join(uploadRoot(), relativePath);
}

/** Best-effort - a file already gone (or never written, for a failed job) is not an error. */
export async function deleteExportFile(relativePath: string): Promise<void> {
  await fs.rm(exportFileAbsolutePath(relativePath), { force: true });
}
