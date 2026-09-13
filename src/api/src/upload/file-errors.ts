/**
 * Purpose: Distinguishes "this file is genuinely not there" from "reading this
 * file failed for some other reason" for every download route in @mou/api.
 * Four routes (MOU document, agreement-history proof, export job, and the
 * wizard's temp-document check) previously caught every filesystem error and
 * answered 404 "file missing", which turned a permission or disk fault into a
 * message telling the user to re-upload a file that was still present.
 *
 * Only ENOENT is treated as missing; everything else is rethrown so it reaches
 * Express's error handler as a 500. The check is deliberately narrow - it
 * inspects the `code` property rather than using `instanceof`, because the
 * error may cross a promise boundary and because a plain object with the right
 * shape is just as valid a signal.
 */

import { promises as fs } from "node:fs";

/** True only for a Node filesystem error whose code is exactly ENOENT. */
export function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Reads a file, returning undefined when it does not exist and rethrowing any
 * other failure. Callers turn undefined into their own 404 and let anything
 * else propagate, so a real fault is never reported as a missing file.
 */
export async function readFileOrThrowMissing(
  absolutePath: string,
): Promise<Buffer | undefined> {
  try {
    return await fs.readFile(absolutePath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}
