/**
 * Purpose: Builds the generated code defined in SPEC-16 section 3.3 (decision D109).
 * The format is MOU-<SCHEME>-<YYYY>-<NNNN>, for example MOU-WILP-2026-0042: the
 * literal prefix, the MOU's scheme, the four-digit IST business year, and the
 * sequence that restarts per scheme per year, zero-padded to four digits. A sequence
 * above 9999 renders at its natural width rather than failing.
 *
 * The code identifies an MOU, not a company, which is why it moved from `company` to
 * `mou`: a company running two schemes holds two agreements and therefore two codes.
 * `zone.code` is deliberately absent - it no longer feeds this format, so replacing a
 * zone code after go-live can no longer orphan historical company codes.
 *
 * The format lives only here so that changing it cannot change any other rule.
 */

const SEQUENCE_PAD_WIDTH = 4;
const YEAR_PAD_WIDTH = 4;
const CODE_PREFIX = "MOU";

export function formatCompanyCode(scheme: string, year: number, sequence: number): string {
  if (scheme.trim() === "") {
    throw new RangeError("scheme must not be empty");
  }
  if (!Number.isInteger(year) || year <= 0) {
    throw new RangeError(`year must be a positive integer, received ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new RangeError(`sequence must be a positive integer, received ${sequence}`);
  }

  const yearText = String(year).padStart(YEAR_PAD_WIDTH, "0");
  const sequenceText = String(sequence).padStart(SEQUENCE_PAD_WIDTH, "0");
  return `${CODE_PREFIX}-${scheme.toUpperCase()}-${yearText}-${sequenceText}`;
}
