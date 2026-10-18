/**
 * Purpose: Prepares the database for the SPEC-02 and SPEC-03 UI tests. It creates
 * the three fixture accounts with a real scrypt hash taken from @mou/api itself,
 * so the tests exercise the genuine login path, and it clears their lockout
 * counters, sessions, and wizard drafts so a previous run cannot leave an
 * account locked, signed in, or blocked by a stale draft. It also clears
 * company data created by the wizard's "full flow" test so the GST number
 * unique constraint does not reject a re-run with the same empty value.
 */

import { hashPassword } from "@mou/api/auth/password";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

import { E2E_ACCOUNTS, E2E_PASSWORD } from "./ui/accounts";

export default async function globalSetup(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL must be set for the UI tests - see environment.sh and .env.example");
  }

  // SPEC-05: clear any MOU PDFs a previous run left behind, the filesystem
  // counterpart to the DELETE statements below. Best-effort - a missing
  // directory on the very first run is not an error.
  const uploadRoot = process.env["UPLOAD_ROOT"];
  if (uploadRoot !== undefined && uploadRoot !== "") {
    await fs.rm(path.join(uploadRoot, "draft-tmp"), { recursive: true, force: true });
    await fs.rm(path.join(uploadRoot, "mou"), { recursive: true, force: true });
    // SPEC-13: generated export files, the filesystem counterpart of the
    // export_job DELETE below.
    await fs.rm(path.join(uploadRoot, "exports"), { recursive: true, force: true });
  }

  const pool = new Pool({ connectionString });
  try {
    const passwordHash = await hashPassword(E2E_PASSWORD);
    const usernames = E2E_ACCOUNTS.map((account) => account.username);

    for (const account of E2E_ACCOUNTS) {
      await pool.query(
        `INSERT INTO "user" (username, email, password_hash, role, is_active, approval_status)
         VALUES ($1, $2, $3, $4, true, 'APPROVED')
         ON CONFLICT (username) DO UPDATE
            SET password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                is_active = true,
                approval_status = 'APPROVED'`,
        [account.username, `${account.username}@example.com`, passwordHash, account.role],
      );
    }

    // A locked account or a leftover session from an earlier run would make the
    // results depend on the order the suite was run in.  We delete ALL login_attempt
    // rows (not only the fixture accounts) because tests like "unknown username" use
    // hard-coded identifiers that can accumulate lockouts across debugging runs.
    await pool.query(`DELETE FROM login_attempt`);

    // Clear wizard drafts so a previous run's resume prompt does not block the form.
    await pool.query(`DELETE FROM company_draft`);

    // Clear company data created by the wizard's full-flow test (and by
    // SPEC-07/08/09/10's own UI-test fixtures, inserted directly via `pg`) so
    // the GST number unique constraint does not reject a re-run with the same
    // empty value. The order respects FK constraints: children first, then
    // parents. mou_document, mou_alert, agreement_history and
    // mou_edit_request must go before mou (SPEC-05/08/10) - every FK here is
    // ON DELETE RESTRICT like every other child table's.
    await pool.query(`DELETE FROM payroll_item`);
    await pool.query(`DELETE FROM trainee_category`);
    await pool.query(`DELETE FROM payroll_config`);
    await pool.query(`DELETE FROM commercial_item`);
    await pool.query(`DELETE FROM mou_document`);
    await pool.query(`DELETE FROM mou_alert`);
    await pool.query(`DELETE FROM scheduled_job_state`);
    await pool.query(`DELETE FROM agreement_history`);
    await pool.query(`DELETE FROM mou_edit_request`);
    await pool.query(`DELETE FROM mou`);
    await pool.query(`DELETE FROM company_plant`);
    await pool.query(`DELETE FROM company`);
    await pool.query(`DELETE FROM company_code_counter`);

    // SPEC-13: export jobs accumulate across runs otherwise (no FK ordering
    // concern - export_job only references user, which this setup never
    // deletes).
    await pool.query(`DELETE FROM export_job`);

    await pool.query(
      `DELETE FROM session
        WHERE user_id IN (SELECT id FROM "user" WHERE username = ANY($1::text[]))`,
      [usernames],
    );
  } finally {
    await pool.end();
  }
}
