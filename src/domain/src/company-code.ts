/**
 * Purpose: Builds the generated company code defined in SPEC-01 section 6.3. The
 * format is <ZONE_CODE>-<YY>-<NNNN>, for example WEST-26-0042: the zone's own code,
 * the last two digits of the IST business year, and the sequence that restarts per
 * zone per year, zero-padded to four digits. A sequence above 9999 renders at its
 * natural width rather than failing. The format lives only here so that changing it
 * (open question Q2) cannot change any other rule.
 */

const SEQUENCE_PAD_WIDTH = 4;
const YEAR_SUFFIX_WIDTH = 2;
const CENTURY = 100;

export function formatCompanyCode(zoneCode: string, year: number, sequence: number): string {
  if (zoneCode.trim() === "") {
    throw new RangeError("zoneCode must not be empty");
  }
  if (!Number.isInteger(year)) {
    throw new RangeError(`year must be an integer, received ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new RangeError(`sequence must be a positive integer, received ${sequence}`);
  }

  const yearSuffix = String(((year % CENTURY) + CENTURY) % CENTURY).padStart(YEAR_SUFFIX_WIDTH, "0");
  const sequenceText = String(sequence).padStart(SEQUENCE_PAD_WIDTH, "0");
  return `${zoneCode.toUpperCase()}-${yearSuffix}-${sequenceText}`;
}
