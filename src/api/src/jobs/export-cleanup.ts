/**
 * Purpose: SPEC-13 section 5 - a generated export file is deleted 24 hours
 * after creation. Scheduled the same way SPEC-08's expiry-alert job is
 * (`index.ts`'s `main()`, a plain `setInterval`, no queue): expired rows are
 * deleted from `export_job` and their files removed from disk, so neither
 * the row nor the file outlives the other.
 */

import type { Pool } from "pg";

import { deleteExportFile } from "../upload/export-storage.ts";

export async function runExportCleanup(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ file_path: string | null }>(
    `DELETE FROM export_job WHERE expires_at < now() RETURNING file_path`,
  );
  for (const row of rows) {
    if (row.file_path !== null) {
      await deleteExportFile(row.file_path);
    }
  }
}
