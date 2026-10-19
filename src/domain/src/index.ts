/**
 * Purpose: The public surface of @mou/domain, the layer 0 package created by
 * SPEC-01. It re-exports the master reference lists (section 2), the commercial and
 * payroll item catalogues (sections 3 and 4), the branded Money type (section 6.4)
 * and the shared derived rules - MOU end date, MOU status and the company code
 * format (section 6). Consumers import from "@mou/domain" only, leaving the
 * internal file layout free to change.
 */

export * from "./enums.ts";
export * from "./commercial-items.ts";
export * from "./payroll-items.ts";
export * from "./money.ts";
export * from "./mou-rules.ts";
export * from "./company-code.ts";
export * from "./company-details-validation.ts";
export * from "./commercial-details-validation.ts";
export * from "./payroll-details-validation.ts";
export * from "./agreement-diff.ts";
export * from "./user-account-validation.ts";
