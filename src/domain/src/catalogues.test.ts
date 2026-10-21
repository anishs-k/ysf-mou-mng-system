/**
 * Purpose: Unit tests for the master reference lists and item catalogues - SPEC-01
 * acceptance criterion AC4, as amended by SPEC-16. Asserts the exact catalogue sizes
 * (10 commercial, 4 payroll), that keys, labels and display order are stable and
 * complete, that display order is the section `#` column, and that the allowance /
 * deduction split matches SPEC-16 section 2.6. It also guards the invariants the
 * database CHECK constraints and partial unique indexes depend on, and that every
 * scheme carries the five guideline fields the wizard's panel renders. SPEC-23
 * adds PF, ESI and TDS and the per-item value kind (D142, D143).
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
  PAYROLL_FIXED_ITEM_KEYS,
  PAYROLL_ITEM_BY_KEY,
  PAYROLL_ITEM_KEYS,
  PAYROLL_ITEMS,
  PERCENT_ITEM_KEYS,
  STATUS_ITEM_KEYS,
  STATUTORY_ITEM_KEYS,
} from "./payroll-items.ts";
import {
  COMMERCIAL_BASIS_OPTIONS,
  COMMERCIAL_PERIOD_OPTIONS,
  COMPANY_DOCUMENT_TYPE_OPTIONS,
  COMPANY_TYPE_OPTIONS,
  COMPANY_TYPES,
  CONTACT_TYPE_OPTIONS,
  EDIT_AGREEMENT_REASON_OPTIONS,
  ENUM_SETS,
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

test("AC4 commercial catalogue has exactly 10 entries after D153 kept the 9 core charges", () => {
  assert.equal(COMMERCIAL_ITEMS.length, 10);
  assert.equal(COMMERCIAL_ITEM_KEYS.length, 10);
});

test("AC4 payroll catalogue has exactly 4 entries after D158 kept only PF, ESI and TDS", () => {
  assert.equal(PAYROLL_ITEMS.length, 4);
  assert.equal(PAYROLL_ITEM_KEYS.length, 4);
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
  assert.equal(deductions.length, 9);
});

test("D158 the payroll catalogue is PF, ESI and TDS (deductions) plus OTHER - no allowances", () => {
  assert.deepEqual([...PAYROLL_ITEM_KEYS], ["PF", "ESI", "TDS", "OTHER"]);
  assert.equal(PAYROLL_ITEMS.filter((item) => item.itemType === "ALLOWANCE").length, 0);
  assert.deepEqual(
    PAYROLL_ITEMS.filter((item) => item.itemType === "DEDUCTION").map((item) => item.key),
    ["PF", "ESI", "TDS"],
  );
});

test("SPEC-23 D143 PF and ESI are percentages, TDS is a status", () => {
  assert.equal(PAYROLL_ITEM_BY_KEY.PF.valueKind, "PERCENT");
  assert.equal(PAYROLL_ITEM_BY_KEY.ESI.valueKind, "PERCENT");
  assert.equal(PAYROLL_ITEM_BY_KEY.TDS.valueKind, "STATUS");
});

test("SPEC-23 the key lists the database CHECKs are built from match the catalogue", () => {
  assert.deepEqual([...PERCENT_ITEM_KEYS], ["PF", "ESI"]);
  assert.deepEqual([...STATUS_ITEM_KEYS], ["TDS"]);
  assert.deepEqual([...STATUTORY_ITEM_KEYS], ["PF", "ESI", "TDS"]);
});

test("SPEC-23 D145 company documents are GST and Registration certificates", () => {
  assert.deepEqual(
    COMPANY_DOCUMENT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
    [
      ["GST_CERTIFICATE", "GST Certificate"],
      ["REGISTRATION_CERTIFICATE", "Registration Certificate"],
    ],
  );
});

test("D151 / D158 the demo deductions and the 13 allowance / deduction items are gone from the payroll catalogue", () => {
  const removed = [
    "ADVANCE",
    "CANTEEN_DEDUCTION",
    "COURSE_REGISTRATION_FEE",
    "DOCUMENT_FEE",
    "EXAM_FEE",
    "INSURANCE_DEDUCTION",
    "LEFT_DEDUCTION",
    "SHOES_DEDUCTION",
    "TRANSPORTATION_DEDUCTION",
    "UNIFORM_DEDUCTION",
    // D158
    "ATTENDANCE_BONUS",
    "ACCOMMODATION_ALLOWANCE",
    "CONVEYANCE",
    "HRA",
    "BONUS",
    "NIGHT_SHIFT_ALLOWANCE",
    "EDUCATION_ALLOWANCE",
    "INSURANCE",
    "ADMISSION_DEDUCTION",
    "COUPON_AMOUNT",
    "EDUCATION_FEE",
    "JOINING_FEE_DEDUCTION",
    "SKILL_DIPLOMA_FEES",
  ];
  const keys: readonly string[] = PAYROLL_ITEM_KEYS;
  for (const key of removed) assert.ok(!keys.includes(key), key);
});

test("D153 the commercial catalogue holds only the 9 core charges plus OTHER", () => {
  assert.deepEqual(
    [...COMMERCIAL_ITEM_KEYS],
    [
      "ADMIN_CHARGES",
      "INSURANCE",
      "SHOES_AND_UNIFORM",
      "SUPERVISOR_CHARGES",
      "SOURCING_CHARGES",
      "EDUCATION_CHARGES",
      "TRAINING_CHARGES",
      "ASSESSMENT_CHARGES",
      "ONE_TIME_REGISTRATION_FEES",
      "OTHER",
    ],
  );
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
  assert.equal(COMMERCIAL_FIXED_ITEM_KEYS.length, 9);
  assert.equal(PAYROLL_FIXED_ITEM_KEYS.length, 3);
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
  // The v2 source misspelled two of these; a typo must never become a stored value.
  const basisLabels = COMMERCIAL_BASIS_OPTIONS.map((option) => option.label);
  assert.ok(basisLabels.includes("Pro-rata"), "PRO_RATA must read Pro-rata");
  assert.ok(
    basisLabels.includes("On payable stipend"),
    "ON_PAYABLE_STIPEND must read On payable stipend",
  );
});

test("the aggregate served by /api/enums covers all twelve reference lists", () => {
  assert.deepEqual(Object.keys(ENUM_SETS).sort(), [
    "commercialBases",
    "commercialPeriods",
    "companyTypes",
    "contactTypes",
    "editAgreementReasons",
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
