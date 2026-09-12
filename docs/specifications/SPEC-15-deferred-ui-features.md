# SPEC-15 — Deferred UI Features

**Depends on:** SPEC-02 (Auth), SPEC-14 (Figma UI Replication).
**Source:** raised during SPEC-14's grill-me interview, 2026-09-13 (D83).
**Status:** not implemented. This document exists only to hold the decision
and its rationale so the two UI elements it describes are not silently
forgotten. No acceptance criteria yet — write them when this is picked up.

---

## 1. Why this exists

SPEC-14 replicates the Figma login page pixel-for-pixel. That design includes
a "Remember Me" checkbox and a "Forgot Password" link. Neither has ever been
part of SPEC-02's authentication design:

- SPEC-02 sessions have one fixed lifetime; there is no "remembered" longer
  session and no cookie-duration variant.
- SPEC-02 has no password-reset flow at all — no reset token table, no email
  delivery mechanism, no reset endpoint.

Per D83, SPEC-14 renders both elements visually (matching Figma exactly) but
wires them to no-ops, rather than either omitting them or building real
functionality inside a UI-replication spec. This document is where the real
functionality, when wanted, gets designed.

## 2. Remember Me

Open questions for whoever picks this up:

- Does "remembered" mean a longer session TTL, a persistent (non-session)
  cookie, or a silent re-login token separate from the session row SPEC-02
  already uses?
- Does checking it change server-side session-row expiry, or only client-side
  cookie `Max-Age`? The former needs a schema change to `session`
  (SPEC-01 §... — currently sessions have one fixed lifetime); the latter is
  weaker but needs no schema change.
- Interacts with SPEC-02's 5-failure/15-minute lockout — does a remembered
  session reset that counter's window at all? Almost certainly not, but
  worth stating explicitly once this is designed.

## 3. Forgot Password

Open questions for whoever picks this up:

- Delivery channel: this system has no outbound email integration today
  (SPEC-08's alert email is explicitly "behind a flag, off by default" —
  Q9 in `specindex.md`). A password reset flow needs one either way, so this
  probably cannot land before that flag is resolved, or needs its own
  channel decision.
- Reset token storage: a new table (short-lived, single-use, like
  `mou_edit_request`'s `consumed_at` pattern — ADR D55) or a signed/expiring
  token that needs no storage at all.
- Who can trigger a reset for whom — self-service only, or can an ADMIN
  trigger one on behalf of a locked-out user?

## 4. Non-goals for now

Neither feature blocks SPEC-14. Both render correctly and do nothing when
used, which is the accepted state until this spec is picked up.
