/**
 * Purpose: How every API-wired screen turns API values into the words the design
 * shows - calendar dates ("31 Mar 2027", parsed as a date, never shifted by the
 * time zone), scheme and MoU-status enum codes as labels, and the derived
 * "Expiring" status for an active MoU ending within EXPIRING_SOON_DAYS. One
 * module, so the Dashboard, Zone Dashboard and Alerts screens cannot disagree.
 */

import { MOU_STATUS_LABELS, SCHEME_LABELS } from "@mou/domain";
import type { MouStatus, Scheme } from "@mou/domain";

/** An ACTIVE MoU ending within this many days is "Expiring" - the API's EXPIRING_SOON_DAYS too. */
export const EXPIRING_SOON_DAYS = 90;

/** Shown in place of a value the API has not answered with, or does not have. */
export const PENDING_FIGURE = "—";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };

function utcMidnight(isoDate: string): number {
  const [year = 0, month = 1, day = 1] = isoDate.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Today's local calendar date as "YYYY-MM-DD", the shape the API and validators use. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "2027-03-31" -> "31 Mar 2027". */
export function formatCalendarDate(isoDate: string | null | undefined): string {
  if (isoDate === null || isoDate === undefined || isoDate === "") return PENDING_FIGURE;
  return new Date(utcMidnight(isoDate)).toLocaleDateString("en-GB", { ...DATE_FORMAT, timeZone: "UTC" });
}

/** An ISO timestamp shown as the viewer's local date, e.g. "17 Oct 2026". */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", DATE_FORMAT);
}

/** Whole days from today to `isoDate`; negative once it has passed. */
export function daysUntil(isoDate: string, today: string = todayIso()): number {
  return Math.round((utcMidnight(isoDate) - utcMidnight(today)) / MS_PER_DAY);
}

export function schemeLabel(scheme: string | null): string {
  if (scheme === null) return PENDING_FIGURE;
  return SCHEME_LABELS[scheme as Scheme] ?? scheme;
}

/** ACTIVE / EXPIRED / NEW as labels; text that is already a label passes through. */
export function mouStatusLabel(status: string | null): string {
  if (status === null) return PENDING_FIGURE;
  return MOU_STATUS_LABELS[status as MouStatus] ?? status;
}

/** 5 -> "5th of every month"; null -> PENDING_FIGURE. */
export function stipendDayText(day: number | null): string {
  if (day === null) return PENDING_FIGURE;
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  return `${day}${suffix} of every month`;
}

/** 2048 -> "2.0 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The status the design shows: "Expiring" for an active MoU ending within the window. */
export function displayStatus(status: string, endDate: string, today: string = todayIso()): string {
  const label = mouStatusLabel(status);
  if (label !== MOU_STATUS_LABELS.ACTIVE) return label;
  const days = daysUntil(endDate, today);
  return days >= 0 && days <= EXPIRING_SOON_DAYS ? "Expiring" : label;
}
