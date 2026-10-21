/**
 * Purpose: Unit tests for the SPEC-23 §2.4 payroll value formatter - the one
 * place that turns a stored payroll answer into the text the web app, the Excel
 * export and both PDFs show (₹ amount per month, a percentage, or the TDS status).
 * Written before the implementation, per the working rules.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPayrollValue, formatPercent, payrollAnswerText, payrollStatusLabel } from "./payroll-value.ts";

test("an applicable amount reads as rupees per month", () => {
  assert.equal(formatPayrollValue("AMOUNT", "1500.00", true), "₹ 1500.00/mo");
});

test("a PDF can ask for Rs. where its font has no rupee sign", () => {
  assert.equal(formatPayrollValue("AMOUNT", "1500.00", true, "Rs."), "Rs. 1500.00/mo");
  assert.equal(formatPayrollValue("PERCENT", "12.00", true, "Rs."), "12%");
});

test("a percentage drops trailing zeros and gains a % sign", () => {
  assert.equal(formatPayrollValue("PERCENT", "12.00", true), "12%");
  assert.equal(formatPayrollValue("PERCENT", "0.75", true), "0.75%");
  assert.equal(formatPayrollValue("PERCENT", "7.50", true), "7.5%");
  assert.equal(formatPayrollValue("PERCENT", "100", true), "100%");
});

test("a status reads As applicable or Not applicable", () => {
  assert.equal(formatPayrollValue("STATUS", null, true), "As applicable");
  assert.equal(formatPayrollValue("STATUS", null, false), "Not applicable");
});

test("an item with no stored answer (an MOU saved before SPEC-23) reads Not recorded", () => {
  assert.equal(formatPayrollValue("PERCENT", null, null), "Not recorded");
  assert.equal(formatPayrollValue("STATUS", null, null), "Not recorded");
});

test("any item that is not applicable reads Not applicable", () => {
  assert.equal(formatPayrollValue("AMOUNT", null, false), "Not applicable");
  assert.equal(formatPayrollValue("PERCENT", null, false), "Not applicable");
});

test("an applicable amount or percentage with no stored value reads as a dash", () => {
  assert.equal(formatPayrollValue("AMOUNT", null, true), "—");
  assert.equal(formatPayrollValue("PERCENT", "", true), "—");
});

test("formatPercent keeps a malformed value as typed rather than guessing", () => {
  assert.equal(formatPercent("12.50"), "12.5%");
  assert.equal(formatPercent("abc"), "abc%");
});

test("payrollStatusLabel names both TDS options", () => {
  assert.equal(payrollStatusLabel(true), "As applicable");
  assert.equal(payrollStatusLabel(false), "Not applicable");
});

test("payrollAnswerText keeps the history views' Yes (amount) / No wording", () => {
  assert.equal(payrollAnswerText("AMOUNT", { isApplicable: true, amount: "200" }), "Yes (200)");
  assert.equal(payrollAnswerText("AMOUNT", { isApplicable: false, amount: "" }), "No");
  assert.equal(payrollAnswerText("AMOUNT", undefined), "No");
  assert.equal(payrollAnswerText("AMOUNT", { isApplicable: true, amount: "" }), "Yes (—)");
});

test("payrollAnswerText shows a percentage and a TDS status", () => {
  assert.equal(payrollAnswerText("PERCENT", { isApplicable: true, amount: "12.00" }), "Yes (12%)");
  assert.equal(payrollAnswerText("STATUS", { isApplicable: true, amount: "" }), "As applicable");
  assert.equal(payrollAnswerText("STATUS", { isApplicable: false, amount: "" }), "Not applicable");
  assert.equal(payrollAnswerText("STATUS", undefined), "—");
});
