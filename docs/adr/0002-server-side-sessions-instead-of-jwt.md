# ADR 0002: Server-side sessions instead of JWT

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

Users log in from a browser to a single web app. We need authentication that is secure by
default, supports logging out immediately, and is simple to reason about.

## Options considered

1. **JWT in `localStorage`**: readable by any injected script (XSS steals the token), and
   tokens cannot be revoked before they expire without extra infrastructure.
2. **JWT in an httpOnly cookie**: avoids the XSS problem, but revocation still needs a
   deny-list, which is a session table with extra steps.
3. **Opaque session token in an httpOnly cookie, stored server-side**: simple and revocable.

## Decision

Option 3.

- On login, the API generates a 256-bit random token and sets it in a cookie with
  `HttpOnly`, `SameSite=Lax`, `Secure` (production) and the `__Host-` prefix (production).
- Only the SHA-256 hash of the token is stored in the `sessions` table, so a database
  leak does not expose usable sessions.
- Logout deletes the session row, so it takes effect immediately.

## Consequences

- One database lookup per authenticated request (indexed by `tokenHash`). This is fine at this
  scale and can be cached in Redis later.
- Cookies require CSRF protection; see [ADR 0003](0003-csrf-protection.md).
- Mobile apps or third-party API clients would need a separate token flow (not in scope).
