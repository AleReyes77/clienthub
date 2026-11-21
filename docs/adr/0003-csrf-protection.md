# ADR 0003: CSRF protection with origin checks and SameSite cookies

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

Session cookies are sent automatically by the browser, so a malicious site could try to make a
logged-in user's browser send a state-changing request (CSRF).

## Decision

Two layers, following the OWASP CSRF Prevention Cheat Sheet:

1. **Origin verification**: every `POST`, `PATCH` and `DELETE` must have an `Origin` header
   (or `Referer` as fallback) that matches `WEB_ORIGIN`. Otherwise the API returns
   `403 CSRF_ORIGIN_MISMATCH`. Browsers set `Origin` themselves and pages cannot forge it.
2. **`SameSite=Lax` cookies**: the browser does not attach the session cookie to cross-site
   `POST` requests in the first place.

In addition, the API only accepts JSON bodies, which a plain HTML form on another site cannot send.

Synchronizer tokens were not added because the app is a single-origin SPA-style frontend
and the two layers above already cover the threat without extra state.

## Consequences

- Requests without an `Origin`/`Referer` (for example `curl`) cannot change data unless they set
  the header. Integration tests set `Origin` explicitly.
- The check is covered by tests in `apps/api/test/auth.test.ts`.
