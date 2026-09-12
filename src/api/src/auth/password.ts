/**
 * Purpose: Hashes and verifies user passwords for SPEC-02 section 2.1 using
 * node:crypto's scrypt, so no native module or third-party dependency is needed.
 * A stored value is self-describing - scrypt$N$r$p$salt$hash - so the cost
 * parameters can be raised later without invalidating existing hashes. Verification
 * compares with timingSafeEqual, and returns false for anything that is not a
 * well-formed hash of ours: a legacy plaintext row therefore simply cannot
 * authenticate, rather than accidentally matching.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface ScryptParameters {
  /** CPU/memory cost; memory used is roughly 128 * cost * blockSize bytes. */
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelisation: number;
}

/** OWASP-acceptable scrypt parameters: about 16 MB and a few tens of ms per hash. */
export const DEFAULT_SCRYPT_PARAMETERS: ScryptParameters = {
  cost: 16384,
  blockSize: 8,
  parallelisation: 1,
};

const ALGORITHM = "scrypt";
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const FIELD_SEPARATOR = "$";
const FIELD_COUNT = 6;

/**
 * Upper bounds on the parameters read back out of a stored value. They exist only
 * so that a corrupted or hostile row cannot make verification allocate gigabytes.
 */
const MAX_COST = 1 << 17;
const MAX_BLOCK_SIZE = 32;
const MAX_PARALLELISATION = 16;

interface ParsedHash {
  readonly parameters: ScryptParameters;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

function deriveKey(password: string, salt: Buffer, parameters: ScryptParameters): Promise<Buffer> {
  // Wrapped by hand rather than with promisify(): promisify resolves scrypt's
  // overload without the options argument, which loses the cost parameters.
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_BYTES,
      { N: parameters.cost, r: parameters.blockSize, p: parameters.parallelisation },
      (error, derivedKey) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

function parseStoredHash(value: string): ParsedHash | null {
  const fields = value.split(FIELD_SEPARATOR);
  if (fields.length !== FIELD_COUNT) {
    return null;
  }
  const [algorithm, costText, blockSizeText, parallelisationText, saltText, hashText] = fields;
  if (algorithm !== ALGORITHM) {
    return null;
  }

  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelisation = Number(parallelisationText);
  const inRange = (candidate: number, maximum: number): boolean =>
    Number.isInteger(candidate) && candidate > 0 && candidate <= maximum;
  if (
    !inRange(cost, MAX_COST) ||
    !inRange(blockSize, MAX_BLOCK_SIZE) ||
    !inRange(parallelisation, MAX_PARALLELISATION)
  ) {
    return null;
  }

  const salt = Buffer.from(saltText ?? "", "base64");
  const hash = Buffer.from(hashText ?? "", "base64");
  if (salt.length === 0 || hash.length === 0) {
    return null;
  }
  return { parameters: { cost, blockSize, parallelisation }, salt, hash };
}

export async function hashPassword(
  password: string,
  parameters: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await deriveKey(password, salt, parameters);
  return [
    ALGORITHM,
    parameters.cost,
    parameters.blockSize,
    parameters.parallelisation,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join(FIELD_SEPARATOR);
}

/** True only for a value this module produced - used to detect a legacy plaintext row. */
export function isPasswordHash(value: string): boolean {
  return parseStoredHash(value) !== null;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseStoredHash(storedHash);
  if (parsed === null) {
    return false;
  }
  const derived = await deriveKey(password, parsed.salt, parsed.parameters);
  if (derived.length !== parsed.hash.length) {
    return false;
  }
  return timingSafeEqual(derived, parsed.hash);
}
