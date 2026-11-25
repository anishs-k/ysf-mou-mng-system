/**
 * Purpose: Unit tests for SPEC-34's YSF / YSI split - which schemes belong to
 * which organisation, which fields only a YSI agreement shows, and
 * validateOrganisationFields, which the wizard, the final save, bulk upload and
 * Edit Agreement all use.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { SCHEMES } from "./enums.ts";
import {
  isChargeShown,
  isEducationFeePayerShown,
  ORGANISATION_SCHEMES,
  ORGANISATIONS,
  organisationOfScheme,
  validateOrganisationFields,
  YSI_ONLY_CHARGE_KEYS,
} from "./organisations.ts";

test("SPEC-34 YSF runs NAPS and NATS; YSI runs WILP, FLEXI, BVoc, DVoc and MSBTE", () => {
  assert.deepEqual([...ORGANISATIONS], ["YSF", "YSI"]);
  assert.deepEqual([...ORGANISATION_SCHEMES.YSF], ["NAPS", "NATS"]);
  assert.deepEqual([...ORGANISATION_SCHEMES.YSI], ["WILP", "FLEXI", "BVOC", "DVOC", "MSBTE"]);
});

test("SPEC-34 every scheme belongs to exactly one organisation", () => {
  for (const scheme of SCHEMES) {
    const owners = ORGANISATIONS.filter((org) => (ORGANISATION_SCHEMES[org] as readonly string[]).includes(scheme));
    assert.equal(owners.length, 1, scheme);
    assert.equal(organisationOfScheme(scheme), owners[0]);
  }
  assert.equal(organisationOfScheme(""), undefined);
  assert.equal(organisationOfScheme("BOGUS"), undefined);
});

test("SPEC-34 the five YSI-only fees are hidden for YSF, every charge is shown for YSI", () => {
  assert.deepEqual([...YSI_ONLY_CHARGE_KEYS], [
    "EDUCATION_CHARGES",
    "ONE_TIME_REGISTRATION_FEES",
    "EXAMINATION_FEES",
    "EMPLOYABILITY_TEST_FEES",
    "MSBTE_AFFILIATION_FEES",
  ]);
  for (const key of YSI_ONLY_CHARGE_KEYS) {
    assert.equal(isChargeShown("YSF", key), false, key);
    assert.equal(isChargeShown("YSI", key), true, key);
  }
  assert.equal(isChargeShown("YSF", "ADMIN_CHARGES"), true);
  assert.equal(isChargeShown("YSF", "TRAINING_CHARGES"), true);
  assert.equal(isChargeShown(undefined, "EXAMINATION_FEES"), true);
  assert.equal(isEducationFeePayerShown("YSF"), false);
  assert.equal(isEducationFeePayerShown("YSI"), true);
});

test("SPEC-34 a valid YSF or YSI agreement has no errors", () => {
  assert.deepEqual(validateOrganisationFields({ organisation: "YSF", scheme: "NAPS", charges: { ADMIN_CHARGES: "500" } }), {});
  assert.deepEqual(
    validateOrganisationFields({ organisation: "YSI", scheme: "WILP", charges: { EXAMINATION_FEES: "300" }, educationFeePayer: "COMPANY" }),
    {},
  );
});

test("SPEC-34 the organisation must be YSF or YSI, and the scheme must be one of its own", () => {
  assert.deepEqual(validateOrganisationFields({ organisation: "ABC", scheme: "NAPS", charges: {} }), { organisation: "Choose YSF or YSI" });
  assert.deepEqual(validateOrganisationFields({ organisation: "YSF", scheme: "WILP", charges: {} }), {
    scheme: "Choose a YSF scheme (NAPS or NATS)",
  });
  assert.deepEqual(validateOrganisationFields({ organisation: "YSI", scheme: "NATS", charges: {} }), {
    scheme: "Choose a YSI scheme (WILP, FLEXI, BVoc, DVoc or MSBTE)",
  });
});

test("SPEC-34 a YSF agreement may not carry a YSI-only fee or the education fee payer", () => {
  const errors = validateOrganisationFields({
    scheme: "NAPS",
    charges: { ADMIN_CHARGES: "500", EXAMINATION_FEES: "300", MSBTE_AFFILIATION_FEES: " " },
    educationFeePayer: "COMPANY",
  });
  assert.deepEqual(errors, {
    charges: { EXAMINATION_FEES: "This fee applies to YSI agreements only" },
    educationFeePayer: "This applies to YSI agreements only",
  });
});

test("SPEC-34 a fee an existing YSF agreement already holds may be kept (Edit Agreement)", () => {
  const input = { scheme: "NAPS", charges: { ONE_TIME_REGISTRATION_FEES: "1000" } };
  assert.deepEqual(validateOrganisationFields({ ...input, keepCharges: ["ONE_TIME_REGISTRATION_FEES"] }), {});
  assert.ok(validateOrganisationFields(input).charges !== undefined);
});

test("SPEC-35 a YSF Other row named like a YSI-only fee is refused; other names and YSI are fine", () => {
  const otherItems = [
    { label: "Examination fee" },
    { label: "Education / Training" },
    { label: " MSBTE  Affiliation Fees " },
    { label: "Course registration" },
    { label: "Canteen" },
    { label: "education charges" },
  ];
  const message = "This fee is for YSI only. Choose YSI to add it.";
  assert.deepEqual(validateOrganisationFields({ scheme: "NATS", charges: {}, otherItems }).otherItems, [
    message,
    undefined,
    message,
    message,
    undefined,
    message,
  ]);
  assert.deepEqual(validateOrganisationFields({ scheme: "WILP", charges: {}, otherItems }), {});
  assert.deepEqual(validateOrganisationFields({ scheme: "NATS", charges: {}, otherItems: [{ label: "Canteen" }] }), {});
});

test("SPEC-35 Edit Agreement may keep an Other row the YSF agreement already held", () => {
  const otherItems = [{ label: "Examination Fees" }];
  assert.deepEqual(validateOrganisationFields({ scheme: "NAPS", charges: {}, otherItems, keepOtherLabels: ["examination fees"] }), {});
});
