/**
 * Purpose: Unit tests for the master reference lists and item catalogues - SPEC-01
 * acceptance criterion AC4, as amended by SPEC-16. Asserts the exact catalogue sizes
 * (17 commercial, 24 payroll), that keys, labels and display order are stable and
 * complete, that display order is the section `#` column, and that the allowance /
 * deduction split matches SPEC-16 section 2.6. It also guards the invariants the
 * database CHECK constraints and partial unique indexes depend on, and that every
 * scheme carries the five guideline fields the wizard's panel renders.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  COMMERCIAL_ITEM_BY_KEY,
  COMMERCIAL_ITEM_KEYS,
  COMMERCIAL_ITEMS,
} from "./commercial-items.ts";
import {
  INSURANCE_ITEM_KEY,
  PAYROLL_FIXED_ITEM_KEYS,
  PAYROLL_ITEM_BY_KEY,
  PAYROLL_ITEM_KEYS,
  PAYROLL_ITEMS,
} from "./payroll-items.ts";
import {
  COMMERCIAL_BASIS_OPTIONS,
  COMMERCIAL_PERIOD_OPTIONS,
  COMPANY_TYPE_OPTIONS,
  COMPANY_TYPES,
  CONTACT_TYPE_OPTIONS,
  EDIT_AGREEMENT_REASON_OPTIONS,
  ENUM_SETS,
  INSURANCE_TYPE_OPTIONS,
  ITEM_TYPE_OPTIONS,
  MOU_STATUS_OPTIONS,
  REGISTRATION_TYPE_OPTIONS,
  SCHEME_GUIDELINES,
  SCHEME_OPTIONS,
  SCHEMES,
  SECTOR_OPTIONS,
  TENURE_UNIT_OPTIONS,
  USER_ROLE_OPTIONS,
} from "./enums.ts";
import type { EnumOption } from "./enums.ts";

test("AC4 commercial catalogue has exactly 17 entries", () => {
  assert.equal(COMMERCIAL_ITEMS.length, 17);
  assert.equal(COMMERCIAL_ITEM_KEYS.length, 17);
});

test("AC4 payroll catalogue has exactly 24 entries", () => {
  assert.equal(PAYROLL_ITEMS.length, 24);
  assert.equal(PAYROLL_ITEM_KEYS.length, 24);
});

test("AC4 the commercial catalogue matches its key tuple in order", () => {
  assert.deepEqual(
    COMMERCIAL_ITEMS.map((item) => item.key),
    [...COMMERCIAL_ITEM_KEYS],
  );
});

test("AC4 the payroll catalogue matches its key tuple in order", () => {
  assert.deepEqual(
    PAYROLL_ITEMS.map((item) => item.key),
    [...PAYROLL_ITEM_KEYS],
  );
});

test("AC4 display order is the section # column, contiguous from 1", () => {
  COMMERCIAL_ITEMS.forEach((item, index) => {
    assert.equal(item.displayOrder, index + 1, `${item.key} display order`);
  });
  PAYROLL_ITEMS.forEach((item, index) => {
    assert.equal(item.displayOrder, index + 1, `${item.key} display order`);
  });
});

test("AC4 every catalogue entry carries a unique key and a non-empty label", () => {
  for (const items of [COMMERCIAL_ITEMS, PAYROLL_ITEMS]) {
    const labels = items.map((item) => item.label);
    assert.equal(new Set(labels).size, labels.length, "labels must be unique");
    for (const item of items) {
      assert.notEqual(item.label.trim(), "", `${item.key} label must not be empty`);
    }
  }
});

test("AC4 every key has a fixed item type except OTHER, where the user chooses", () => {
  for (const items of [COMMERCIAL_ITEMS, PAYROLL_ITEMS]) {
    for (const item of items) {
      if (item.key === "OTHER") {
        assert.equal(item.itemType, null, "OTHER must not carry a fixed item type");
      } else {
        assert.notEqual(item.itemType, null, `${item.key} must carry a fixed item type`);
      }
    }
  }
});

test("commercial charges are all deductions, per the section 3 mapping", () => {
  const deductions = COMMERCIAL_ITEMS.filter((item) => item.itemType === "DEDUCTION");
  assert.equal(deductions.length, 16);
});

test("SPEC-16 section 2.6 splits payroll into 8 allowances and 15 deductions", () => {
  const allowances = PAYROLL_ITEMS.filter((item) => item.itemType === "ALLOWANCE");
  const deductions = PAYROLL_ITEMS.filter((item) => item.itemType === "DEDUCTION");
  assert.equal(allowances.length, 8, "allowance count");
  assert.equal(deductions.length, 15, "deduction count");
  assert.deepEqual(
    allowances.map((item) => item.key),
    [
      "ATTENDANCE_BONUS",
      "ACCOMMODATION_ALLOWANCE",
      "CONVEYANCE",
      "HRA",
      "BONUS",
      "NIGHT_SHIFT_ALLOWANCE",
      "EDUCATION_ALLOWANCE",
      "INSURANCE",
    ],
  );
  assert.deepEqual(
    deductions.map((item) => item.key),
    [
      "ADMISSION_DEDUCTION",
      "ADVANCE",
      "CANTEEN_DEDUCTION",
      "COUPON_AMOUNT",
      "COURSE_REGISTRATION_FEE",
      "DOCUMENT_FEE",
      "EDUCATION_FEE",
      "EXAM_FEE",
      "INSURANCE_DEDUCTION",
      "JOINING_FEE_DEDUCTION",
      "LEFT_DEDUCTION",
      "SHOES_DEDUCTION",
      "SKILL_DIPLOMA_FEES",
      "TRANSPORTATION_DEDUCTION",
      "UNIFORM_DEDUCTION",
    ],
  );
});

test("INSURANCE is the only key that carries the D108 sub-model", () => {
  assert.equal(INSURANCE_ITEM_KEY, "INSURANCE");
  assert.equal(PAYROLL_ITEM_BY_KEY.INSURANCE.itemType, "ALLOWANCE");
  assert.ok(PAYROLL_ITEM_KEYS.includes(INSURANCE_ITEM_KEY));
});

test("the key lookups resolve every catalogue entry", () => {
  for (const item of COMMERCIAL_ITEMS) {
    assert.deepEqual(COMMERCIAL_ITEM_BY_KEY[item.key], item);
  }
  for (const item of PAYROLL_ITEMS) {
    assert.deepEqual(PAYROLL_ITEM_BY_KEY[item.key], item);
  }
});

test("the fixed key lists used by the partial unique indexes exclude OTHER", () => {
  assert.deepEqual(
    [...COMMERCIAL_FIXED_ITEM_KEYS],
    COMMERCIAL_ITEM_KEYS.filter((key) => key !== "OTHER"),
  );
  assert.deepEqual(
    [...PAYROLL_FIXED_ITEM_KEYS],
    PAYROLL_ITEM_KEYS.filter((key) => key !== "OTHER"),
  );
  assert.equal(COMMERCIAL_FIXED_ITEM_KEYS.length, 16);
  assert.equal(PAYROLL_FIXED_ITEM_KEYS.length, 23);
});

test("AC4 every reference list is served with a label for each value", () => {
  const expectedSizes: readonly { options: readonly EnumOption[]; size: number }[] = [
    { options: COMPANY_TYPE_OPTIONS, size: 6 },
    { options: SCHEME_OPTIONS, size: 7 },
    { options: TENURE_UNIT_OPTIONS, size: 2 },
    { options: ITEM_TYPE_OPTIONS, size: 2 },
    { options: USER_ROLE_OPTIONS, size: 3 },
    { options: MOU_STATUS_OPTIONS, size: 3 },
    { options: CONTACT_TYPE_OPTIONS, size: 2 },
    { options: REGISTRATION_TYPE_OPTIONS, size: 10 },
    { options: EDIT_AGREEMENT_REASON_OPTIONS, size: 3 },
    { options: SECTOR_OPTIONS, size: 17 },
    { options: COMMERCIAL_PERIOD_OPTIONS, size: 4 },
    { options: COMMERCIAL_BASIS_OPTIONS, size: 5 },
    { options: INSURANCE_TYPE_OPTIONS, size: 3 },
  ];

  for (const { options, size } of expectedSizes) {
    assert.equal(options.length, size);
    for (const option of options) {
      assert.notEqual(option.label.trim(), "", `${option.value} needs a label`);
    }
  }
});

test("AC4 the section 2 values themselves are unchanged", () => {
  assert.deepEqual(
    [...COMPANY_TYPES],
    [
      "CENTRAL_GOVT",
      "CENTRAL_PSU",
      "CO_OPERATIVE",
      "PRIVATE_SECTOR",
      "STATE_GOVT",
      "STATE_PSU",
    ],
  );
  assert.deepEqual(
    MOU_STATUS_OPTIONS.map((option) => option.value),
    ["ACTIVE", "EXPIRED", "NEW"],
  );
  assert.deepEqual(
    TENURE_UNIT_OPTIONS.map((option) => option.value),
    ["MONTHS", "YEARS"],
  );
});

test("SPEC-16 D101 takes the scheme list to seven values", () => {
  assert.deepEqual(
    [...SCHEMES],
    ["NAPS", "NATS", "WILP", "BVOC", "DVOC", "FLEXI", "MSBTE"],
  );
  assert.deepEqual(
    SCHEME_OPTIONS.map((option) => option.value),
    [...SCHEMES],
  );
  // Widened to string[] deliberately: the union no longer contains this value, so
  // a direct comparison would be a compile error rather than a meaningful assert.
  const schemeValues: readonly string[] = SCHEME_OPTIONS.map((option) => option.value);
  assert.equal(
    schemeValues.includes("BOC_AND_DVOC"),
    false,
    "BOC_AND_DVOC must no longer exist",
  );
});

test("SPEC-16 D113 every scheme carries all five guideline fields", () => {
  for (const scheme of SCHEMES) {
    const guideline = SCHEME_GUIDELINES[scheme];
    assert.ok(guideline, `${scheme} needs a guideline entry`);
    for (const field of ["tagline", "eligibility", "duration", "stipend", "benefit"] as const) {
      assert.notEqual(
        guideline[field].trim(),
        "",
        `${scheme}.${field} must not be empty`,
      );
    }
  }
  assert.deepEqual(Object.keys(SCHEME_GUIDELINES).sort(), [...SCHEMES].sort());
});

test("SPEC-16 D108 the new sub-attribute lists are exactly as specified", () => {
  assert.deepEqual(
    COMMERCIAL_PERIOD_OPTIONS.map((option) => option.value),
    ["MONTHLY", "QUARTERLY", "ONE_TIME", "ANNUAL"],
  );
  assert.deepEqual(
    COMMERCIAL_BASIS_OPTIONS.map((option) => option.value),
    ["FLAT", "PER_TRAINEE_PER_MONTH", "PRO_RATA", "ON_PAYABLE_STIPEND", "OTHER"],
  );
  assert.deepEqual(
    INSURANCE_TYPE_OPTIONS.map((option) => option.value),
    ["TOPUP", "RECOVERY", "BOTH"],
  );
  // The v2 source misspelled two of these; a typo must never become a stored value.
  const basisLabels = COMMERCIAL_BASIS_OPTIONS.map((option) => option.label);
  assert.ok(basisLabels.includes("Pro-rata"), "PRO_RATA must read Pro-rata");
  assert.ok(
    basisLabels.includes("On payable stipend"),
    "ON_PAYABLE_STIPEND must read On payable stipend",
  );
});

test("the aggregate served by /api/enums covers all thirteen reference lists", () => {
  assert.deepEqual(Object.keys(ENUM_SETS).sort(), [
    "commercialBases",
    "commercialPeriods",
    "companyTypes",
    "contactTypes",
    "editAgreementReasons",
    "insuranceTypes",
    "itemTypes",
    "mouStatuses",
    "registrationTypes",
    "schemes",
    "sectors",
    "tenureUnits",
    "userRoles",
  ]);
  assert.equal(ENUM_SETS.companyTypes, COMPANY_TYPE_OPTIONS);
  assert.equal(ENUM_SETS.schemes, SCHEME_OPTIONS);
  assert.equal(ENUM_SETS.sectors, SECTOR_OPTIONS);
});
