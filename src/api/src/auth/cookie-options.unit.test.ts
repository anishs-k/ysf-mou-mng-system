/**
 * Purpose: Unit tests for the session cookie's sameSite/secure selection.
 * These are pure env-var-driven decisions with no database or HTTP involved,
 * but they are load-bearing for deployment: a `lax` cookie is never sent back
 * on a genuinely cross-site request (so login silently fails), and a `none`
 * cookie without `secure` is rejected outright by browsers. The clear-vs-set
 * attribute match matters just as much - a browser only clears a cookie when
 * path/sameSite/secure agree, so a mismatch turns "log out" into a no-op in
 * the browser even though the server-side session row is gone.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { clearSessionCookie, setSessionCookie } from "./middleware.ts";

interface CapturedCookie {
  readonly name: string;
  readonly value: string;
  readonly options: Record<string, unknown>;
}

/** Minimal Express Response stand-in: only cookie()/clearCookie() are used. */
function captureCookies(): {
  response: { cookie: (n: string, v: string, o: Record<string, unknown>) => void; clearCookie: (n: string, o: Record<string, unknown>) => void };
  set: CapturedCookie[];
  cleared: CapturedCookie[];
} {
  const set: CapturedCookie[] = [];
  const cleared: CapturedCookie[] = [];
  return {
    set,
    cleared,
    response: {
      cookie: (name, value, options) => set.push({ name, value, options }),
      clearCookie: (name, options) => cleared.push({ name, value: "", options }),
    },
  };
}

/** Restores whatever the surrounding environment had, so tests don't leak. */
function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const EXPIRES = new Date("2026-01-01T00:00:00Z");

test("defaults to sameSite=lax, the CSRF-safe same-origin/same-site case", () => {
  withEnv({ SESSION_COOKIE_SAMESITE: undefined, NODE_ENV: "development" }, () => {
    const { response, set } = captureCookies();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal Response stand-in
    setSessionCookie(response as any, "session-id", EXPIRES);

    assert.equal(set[0]?.options["sameSite"], "lax");
    assert.equal(set[0]?.options["httpOnly"], true);
  });
});

test("SESSION_COOKIE_SAMESITE=none switches to none for a cross-site deployment", () => {
  withEnv({ SESSION_COOKIE_SAMESITE: "none", NODE_ENV: "development" }, () => {
    const { response, set } = captureCookies();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal Response stand-in
    setSessionCookie(response as any, "session-id", EXPIRES);

    assert.equal(set[0]?.options["sameSite"], "none");
  });
});

test("sameSite=none forces secure, because browsers reject the pair without it", () => {
  // NODE_ENV is deliberately not production: `none` alone must be enough.
  withEnv({ SESSION_COOKIE_SAMESITE: "none", NODE_ENV: "development" }, () => {
    const { response, set } = captureCookies();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal Response stand-in
    setSessionCookie(response as any, "session-id", EXPIRES);

    assert.equal(set[0]?.options["secure"], true);
  });
});

test("production sets secure even when sameSite stays lax", () => {
  withEnv({ SESSION_COOKIE_SAMESITE: undefined, NODE_ENV: "production" }, () => {
    const { response, set } = captureCookies();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal Response stand-in
    setSessionCookie(response as any, "session-id", EXPIRES);

    assert.equal(set[0]?.options["sameSite"], "lax");
    assert.equal(set[0]?.options["secure"], true);
  });
});

test("an unrecognised SESSION_COOKIE_SAMESITE falls back to lax rather than failing open", () => {
  withEnv({ SESSION_COOKIE_SAMESITE: "strict-ish nonsense", NODE_ENV: "development" }, () => {
    const { response, set } = captureCookies();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal Response stand-in
    setSessionCookie(response as any, "session-id", EXPIRES);

    assert.equal(set[0]?.options["sameSite"], "lax");
  });
});

test("clearing uses the same attributes it was set with, or the browser keeps the cookie", () => {
  withEnv({ SESSION_COOKIE_SAMESITE: "none", NODE_ENV: "production" }, () => {
    const { response, set, cleared } = captureCookies();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal Response stand-in
    setSessionCookie(response as any, "session-id", EXPIRES);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal Response stand-in
    clearSessionCookie(response as any);

    const setOptions = set[0]?.options ?? {};
    const clearedOptions = cleared[0]?.options ?? {};
    for (const attribute of ["path", "sameSite", "secure", "httpOnly"]) {
      assert.equal(
        clearedOptions[attribute],
        setOptions[attribute],
        `${attribute} must match between set and clear`,
      );
    }
  });
});
