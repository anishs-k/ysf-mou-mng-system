/**
 * Purpose: Unit tests for the SPEC-04 Page 1 company-detail rules. Page 1 is the
 * widest form in the wizard and every rule is enforced on the server as well as
 * in the UI, so the rules live in @mou/domain and are proved here without a
 * database. The tests are written before the implementation, per the working
 * rules, and they follow the acceptance criteria of SPEC-04 section 6.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GST_STATE_NAMES,
  stateNameForGstCode,
  validateCompanyDetails,
} from "./company-details-validation.ts";
import type { CompanyDetails } from "./company-details-validation.ts";

/** A fully valid record every case can spread and then spoil. */
const VALID: CompanyDetails = {
  companyType: "PRIVATE_SECTOR",
  companyName: "Acme Industries",
  registrationType: "COMPANY",
  tanNumber: "ABCD12345E",
  gstNumber: "27AAPFU0939F1ZV",
  zoneId: "3ce854a9-8703-4f12-92bd-8367714145e8",
  plantName: "Pune Plant",
  addressLine1: "12 Main Street",
  addressLine2: "",
  city: "Pune",
  pinCode: "411001",
  state: "Maharashtra",
  district: "Pune",
  hrContactName: "Rita Sharma",
  financeHeadContactName: "Arun Verma",
  contactType: "MOBILE",
  hrContactNumber: "9876543210",
  financeHeadContactNumber: "9123456780",
  officialEmail: "hr@acme.example",
  confirmEmail: "hr@acme.example",
};

function errorsFor(overrides: Partial<CompanyDetails>) {
  return validateCompanyDetails({ ...VALID, ...overrides }).errors;
}

test("a complete valid record produces neither errors nor warnings", () => {
  const result = validateCompanyDetails(VALID);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.warnings, {});
});

// --- AC2: TAN -----------------------------------------------------------------

test("AC2 TAN ABCD12345E is accepted", () => {
  assert.equal(errorsFor({ tanNumber: "ABCD12345E" }).tanNumber, undefined);
});

test("AC2 a 9-character TAN is rejected", () => {
  assert.ok(errorsFor({ tanNumber: "ABCD1234E" }).tanNumber);
});

test("AC2 a lower-case TAN is rejected before upper-casing", () => {
  assert.ok(errorsFor({ tanNumber: "abcd12345e" }).tanNumber);
});

test("AC2 a TAN with digits in the letter positions is rejected", () => {
  assert.ok(errorsFor({ tanNumber: "ABC12345DE" }).tanNumber);
});

// --- AC3: GST -----------------------------------------------------------------

test("AC3 a GST matching the 15-character pattern is accepted", () => {
  assert.equal(errorsFor({ gstNumber: "27AAPFU0939F1ZV" }).gstNumber, undefined);
});

test("AC3 a 14-character GST is rejected", () => {
  assert.ok(errorsFor({ gstNumber: "27AAPFU0939F1Z" }).gstNumber);
});

test("AC3 a lower-case GST is rejected before upper-casing", () => {
  assert.ok(errorsFor({ gstNumber: "27aapfu0939f1zv" }).gstNumber);
});

// --- AC4 / contact branch: numbers -------------------------------------------

test("a 10-digit mobile starting with 6-9 is accepted", () => {
  const errors = errorsFor({ contactType: "MOBILE", hrContactNumber: "9876543210" });
  assert.equal(errors.hrContactNumber, undefined);
});

test("a mobile starting with 5 is rejected", () => {
  assert.ok(
    errorsFor({ contactType: "MOBILE", hrContactNumber: "5876543210" }).hrContactNumber,
  );
});

test("a 9-digit mobile is rejected", () => {
  assert.ok(
    errorsFor({ contactType: "MOBILE", hrContactNumber: "987654321" }).hrContactNumber,
  );
});

test("a LAN number with an STD code separated by a hyphen is accepted", () => {
  const errors = errorsFor({ contactType: "LAN", hrContactNumber: "020-66201234" });
  assert.equal(errors.hrContactNumber, undefined);
});

test("a LAN number with an STD code separated by a space is accepted", () => {
  const errors = errorsFor({ contactType: "LAN", hrContactNumber: "020 66201234" });
  assert.equal(errors.hrContactNumber, undefined);
});

test("a 5-digit LAN number is rejected", () => {
  assert.ok(errorsFor({ contactType: "LAN", hrContactNumber: "66201" }).hrContactNumber);
});

test("a mobile is rejected when the contact type is LAN", () => {
  assert.ok(errorsFor({ contactType: "LAN", hrContactNumber: "9876543210" }).hrContactNumber);
});

// --- AC6: confirm email -------------------------------------------------------

test("AC6 official and confirm email differing only in case are accepted", () => {
  const errors = errorsFor({
    officialEmail: "A@B.com",
    confirmEmail: "a@b.com",
  });
  assert.equal(errors.confirmEmail, undefined);
});

test("a genuinely different confirm email is rejected", () => {
  assert.ok(
    errorsFor({ officialEmail: "a@b.com", confirmEmail: "a@c.com" }).confirmEmail,
  );
});

test("a malformed official email is rejected", () => {
  assert.ok(errorsFor({ officialEmail: "not-an-email" }).officialEmail);
});

// --- AC7: PIN -----------------------------------------------------------------

test("AC7 a 6-digit PIN is accepted", () => {
  assert.equal(errorsFor({ pinCode: "411001" }).pinCode, undefined);
});

test("AC7 a 5-digit PIN is rejected", () => {
  assert.ok(errorsFor({ pinCode: "41100" }).pinCode);
});

test("AC7 a 7-digit PIN is rejected", () => {
  assert.ok(errorsFor({ pinCode: "4110011" }).pinCode);
});

// --- AC8: GST vs State warning ------------------------------------------------

test("AC8 a GST state code that disagrees with State warns but is not an error", () => {
  const result = validateCompanyDetails({
    ...VALID,
    gstNumber: "09AAPFU0939F1ZV", // 09 = Uttar Pradesh
    state: "Maharashtra",
  });
  assert.ok(result.warnings.gstNumber, "expected a warning on gstNumber");
  assert.equal(result.errors.gstNumber, undefined);
});

test("AC8 a GST state code that agrees with State produces no warning", () => {
  const result = validateCompanyDetails({
    ...VALID,
    gstNumber: "27AAPFU0939F1ZV", // 27 = Maharashtra
    state: "Maharashtra",
  });
  assert.equal(result.warnings.gstNumber, undefined);
});

test("the GST state map resolves every code from 01 to 38", () => {
  for (let n = 1; n <= 38; n += 1) {
    const code = String(n).padStart(2, "0");
    assert.ok(GST_STATE_NAMES[code], `missing state name for code ${code}`);
  }
  assert.equal(Object.keys(GST_STATE_NAMES).length, 38);
});

test("stateNameForGstCode resolves a known code and rejects an unknown one", () => {
  assert.equal(stateNameForGstCode("27"), "Maharashtra");
  assert.equal(stateNameForGstCode("99"), undefined);
});

// --- AC9: required fields -----------------------------------------------------

test("AC9 every required field left empty is reported", () => {
  const required: (keyof CompanyDetails)[] = [
    "companyType",
    "companyName",
    "registrationType",
    "tanNumber",
    "gstNumber",
    "zoneId",
    "plantName",
    "addressLine1",
    "city",
    "pinCode",
    "state",
    "district",
    "hrContactName",
    "financeHeadContactName",
    "hrContactNumber",
    "financeHeadContactNumber",
    "officialEmail",
    "confirmEmail",
  ];

  const errors = validateCompanyDetails({}).errors;
  for (const field of required) {
    assert.ok(errors[field], `expected an error on ${String(field)}`);
  }
});

test("AC9 address line 2 is optional", () => {
  assert.equal(errorsFor({ addressLine2: "" }).addressLine2, undefined);
});

test("a company name shorter than 2 characters is rejected", () => {
  assert.ok(errorsFor({ companyName: "A" }).companyName);
});

test("a company name longer than 150 characters is rejected", () => {
  assert.ok(errorsFor({ companyName: "A".repeat(151) }).companyName);
});

test("a plant name shorter than 2 characters is rejected", () => {
  assert.ok(errorsFor({ plantName: "P" }).plantName);
});

test("an unknown company type is rejected", () => {
  assert.ok(errorsFor({ companyType: "NOT_A_TYPE" }).companyType);
});

test("an unknown contact type is rejected", () => {
  assert.ok(errorsFor({ contactType: "FAX" }).contactType);
});
