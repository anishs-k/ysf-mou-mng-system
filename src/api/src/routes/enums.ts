/**
 * Purpose: Serves GET /api/enums, the single source every dropdown and every
 * ordered charge list in the UI is built from (SPEC-01 section 7). It returns the
 * section 2 enum value/label sets plus the section 3 and 4 item catalogues with
 * their itemType and displayOrder, so no later spec hardcodes its options or its
 * ordering in the frontend. The payload is assembled straight from @mou/domain -
 * the same unions the database CHECK constraints are generated from.
 */

import { COMMERCIAL_ITEMS, ENUM_SETS, PAYROLL_ITEMS } from "@mou/domain";
import { Router } from "express";

export function createEnumsRouter(): Router {
  const router = Router();

  router.get("/enums", (_request, response) => {
    response.json({
      ...ENUM_SETS,
      commercialItems: COMMERCIAL_ITEMS,
      payrollItems: PAYROLL_ITEMS,
    });
  });

  return router;
}
