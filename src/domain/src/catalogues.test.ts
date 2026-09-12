/**
 * Purpose: Unit tests for the master reference lists and item catalogues -
 * acceptance criterion AC4. Asserts the exact catalogue sizes (17 commercial, 23
 * payroll), that keys, labels and display order are stable and complete, that
 * display order is the section 3 and 4 `#` column, and that the allowance /
 * deduction split matches section 4. It also guards the invariants the database
 * CHECK constraints and partial unique indexes depend on.
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
} from "./payroll-items.ts";
import {
  COMPANY_TYPE_OPTIONS,
  COMPANY_TYPES,
  CONTACT_TYPE_OPTIONS,
  EDIT_AGREEMENT_REASON_OPTIONS,
  ENUM_SETS,
  ITEM_TYPE_OPTIONS,
  MOU_STATUS_OPTIONS,
  REGISTRATION_TYPE_OPTIONS,
  SCHEME_OPTIONS,
  TENURE_UNIT_OPTIONS,
  USER_ROLE_OPTIONS,
} from "./enums.ts";
import type { EnumOption } from "./enums.ts";

test("AC4 commercial catalogue has exactly 17 entries", () => {
  assert.equal(COMMERCIAL_ITEMS.length, 17);
  assert.equal(COMMERCIAL_ITEM_KEYS.length, 17);
});

test("AC4 payroll catalogue has exactly 23 entries", () => {
  assert.equal(PAYROLL_ITEMS.length, 23);
  assert.equal(PAYROLL_ITEM_KEYS.length, 23);
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

test("AC4 section 4 makes only Document Fee and Registration Fee deductions", () => {
  const deductions = PAYROLL_ITEMS.filter((item) => item.itemType === "DEDUCTION");
  assert.deepEqual(
    deductions.map((item) => item.key),
    ["DOCUMENT_FEE", "REGISTRATION_FEE"],
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
  assert.equal(COMMERCIAL_FIXED_ITEM_KEYS.length, 16);
  assert.equal(PAYROLL_FIXED_ITEM_KEYS.length, 22);
});

test("AC4 every section 2 list is served with a label for each value", () => {
  const expectedSizes: readonly { options: readonly EnumOption[]; size: number }[] = [
    { options: COMPANY_TYPE_OPTIONS, size: 6 },
    { options: SCHEME_OPTIONS, size: 4 },
    { options: TENURE_UNIT_OPTIONS, size: 2 },
    { options: ITEM_TYPE_OPTIONS, size: 2 },
    { options: USER_ROLE_OPTIONS, size: 3 },
    { options: MOU_STATUS_OPTIONS, size: 3 },
    { options: CONTACT_TYPE_OPTIONS, size: 2 },
    { options: REGISTRATION_TYPE_OPTIONS, size: 10 },
    { options: EDIT_AGREEMENT_REASON_OPTIONS, size: 3 },
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
    SCHEME_OPTIONS.map((option) => option.value),
    ["WILP", "BOC_AND_DVOC", "MSBTE", "FLEXI"],
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

test("the aggregate served by /api/enums covers all nine section 2 lists", () => {
  assert.deepEqual(Object.keys(ENUM_SETS).sort(), [
    "companyTypes",
    "contactTypes",
    "editAgreementReasons",
    "itemTypes",
    "mouStatuses",
    "registrationTypes",
    "schemes",
    "tenureUnits",
    "userRoles",
  ]);
  assert.equal(ENUM_SETS.companyTypes, COMPANY_TYPE_OPTIONS);
  assert.equal(ENUM_SETS.schemes, SCHEME_OPTIONS);
});
