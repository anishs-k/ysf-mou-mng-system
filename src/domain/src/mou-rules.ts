/**
 * Purpose: The two shared MOU rules from SPEC-01 section 6 - computeEndDate
 * (section 6.1) and deriveStatus (section 6.2). Both are pure and take every input
 * as an argument, so they unit-test without a database and without depending on
 * when the suite runs. computeEndDate mirrors Postgres interval arithmetic exactly:
 * the tenure becomes whole months, the day-of-month is clamped to the target month
 * (2026-01-31 + 1 month is 2026-02-28, not 2026-03-03 as JavaScript's own month
 * overflow would give), and one day is then subtracted. Postgres holds the
 * authoritative generated column - this is the preview helper the wizard uses.
 */

import type { MouStatus, TenureUnit } from "./enums.ts";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** A leap-year reference point used so Date.UTC never reinterprets a 2-digit year. */
const REFERENCE_YEAR = 2000;

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_PER_MONTH[month - 1] ?? 0;
}

function parseIsoDate(value: string, argumentName: string): CalendarDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new RangeError(`${argumentName} must be an ISO date (YYYY-MM-DD), received "${value}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > MONTHS_PER_YEAR || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`${argumentName} is not a real calendar date: "${value}"`);
  }
  return { year, month, day };
}

function toUtcTime(value: string, argumentName: string): number {
  const date = parseIsoDate(value, argumentName);
  const time = new Date(Date.UTC(REFERENCE_YEAR, date.month - 1, date.day));
  time.setUTCFullYear(date.year);
  return time.getTime();
}

function formatIsoDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The last day the agreement is in force: start + tenure - 1 day. A 12-month MOU
 * starting 2026-01-01 ends 2026-12-31, so the next term starts cleanly on 2027-01-01.
 */
export function computeEndDate(
  mouStartDate: string,
  tenureValue: number,
  tenureUnit: TenureUnit,
): string {
  if (!Number.isInteger(tenureValue) || tenureValue <= 0) {
    throw new RangeError(`tenureValue must be a positive integer, received ${tenureValue}`);
  }
  const start = parseIsoDate(mouStartDate, "mouStartDate");
  const totalMonths = tenureValue * (tenureUnit === "YEARS" ? MONTHS_PER_YEAR : 1);
  const monthOffset = start.month - 1 + totalMonths;
  const targetYear = start.year + Math.floor(monthOffset / MONTHS_PER_YEAR);
  const targetMonth = ((monthOffset % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
  const targetDay = Math.min(start.day, daysInMonth(targetYear, targetMonth + 1));

  const end = new Date(Date.UTC(REFERENCE_YEAR, targetMonth, targetDay));
  end.setUTCFullYear(targetYear);
  end.setUTCDate(end.getUTCDate() - 1);
  return formatIsoDate(end);
}

/**
 * NEW before the start date, ACTIVE from the start date through the end date
 * inclusive, EXPIRED after it. `today` is passed in rather than read from the
 * clock so callers control the business date and tests pin it.
 */
export function deriveStatus(mouStartDate: string, endDate: string, today: string): MouStatus {
  const start = toUtcTime(mouStartDate, "mouStartDate");
  const end = toUtcTime(endDate, "endDate");
  const reference = toUtcTime(today, "today");

  if (reference < start) {
    return "NEW";
  }
  if (reference <= end) {
    return "ACTIVE";
  }
  return "EXPIRED";
}
