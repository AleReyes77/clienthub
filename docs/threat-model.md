# Threat model

This document lists what ClientHub protects, the main threats (using **STRIDE**), how each one
is mitigated in the code, and the gaps that are known and planned.

_Last reviewed: 2026-11-21 (v0.2)._

## What we protect

| Asset                             | Why it matters                                         |
| --------------------------------- | ------------------------------------------------------ |
| User accounts and passwords       | Account takeover gives access to client data           |
| Session tokens                    | A stolen token is equivalent to a logged-in user       |
| Client project data               | Clients must never see each other's work               |
| Organization membership and roles | Role changes control who can see and change everything |
| Invitation links                  | An invitation grants access to an organization         |
| Password reset links              | A reset link gives full control of the account         |
| Uploaded files                    | Client deliverables; also a way to attack other users  |

## Trust boundaries

```text
[ Browser ] ──HTTPS──▶ [ Next.js (web) ] ──proxy──▶ [ Express API ] ──▶ [ PostgreSQL ]
  untrusted               serves UI only             enforces all rules    trusted
```

The web app only hides actions the user cannot perform. **All authorization is enforced by the API.**

## STRIDE analysis

### Spoofing (pretending to be someone else)

| Threat                                           | Mitigation                                                                                                                                                           | Where                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Password guessing / credential stuffing          | Login and register limited to 10 requests per 15 min per IP                                                                                                          | `middleware/rate-limit.ts`                   |
| Weak passwords                                   | Minimum 12 characters (length over complexity, NIST 800-63B)                                                                                                         | `shared/schemas.ts`                          |
| Offline cracking after a DB leak                 | Argon2id with OWASP parameters (19 MiB, 2 iterations)                                                                                                                | `lib/password.ts`                            |
| Account enumeration via login                    | Same error and similar timing for unknown email and wrong password                                                                                                   | `auth.service.ts`, `lib/password.ts`         |
| Session theft via XSS                            | Session cookie is `HttpOnly`, so scripts cannot read it                                                                                                              | `auth.routes.ts`                             |
| Session theft via DB leak                        | Only SHA-256 hashes of session tokens are stored                                                                                                                     | `lib/tokens.ts`                              |
| Account takeover via password reset              | Reset tokens: 256-bit, hashed, single-use (atomic), 1 hour TTL; older links are invalidated; every session is closed after a reset and the user is notified by email | `email-tokens.service.ts`, `auth.service.ts` |
| Reset or verify links leaking via logs / Referer | Tokens travel in the URL fragment (`#token=`), which browsers never send to servers; the fragment is removed from the address bar                                    | `notifier.ts`, `use-hash-token.ts`           |
| Joining an org with someone else's email         | Invitations require a verified email that matches the invitation                                                                                                     | `organizations.service.ts`                   |

### Tampering (changing data without permission)

| Threat                             | Mitigation                                                                                                                                                                  | Where                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| CSRF                               | Origin check on every state-changing request + `SameSite=Lax`                                                                                                               | `middleware/origin-check.ts`, [ADR 0003](adr/0003-csrf-protection.md) |
| Mass assignment                    | Bodies are parsed with strict Zod schemas; only listed fields reach the DB                                                                                                  | `shared/schemas.ts`, `lib/validate.ts`                                |
| SQL injection                      | All queries go through Prisma (parameterized)                                                                                                                               | services                                                              |
| Privilege escalation through roles | Nobody can change their own role; only owners can change or create owners; invitations can never grant `OWNER`                                                              | `shared/roles.ts`, `members.service.ts`                               |
| Stored XSS through uploaded files  | File type detected from magic bytes (not name or browser type); HTML and SVG rejected; downloads always `Content-Disposition: attachment` with `nosniff` and `CSP: sandbox` | `file-validation.ts`, `files.routes.ts`                               |
| Path traversal with file names     | Storage keys are random UUIDs generated by the server; the original name is only shown, never used as a path                                                                | `lib/storage.ts`                                                      |
| HTML injection in emails           | Every user-provided value is escaped in HTML emails                                                                                                                         | `notifications/templates.ts`                                          |

### Repudiation (denying an action)

| Threat                        | Mitigation                                                                                                  | Status |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| No record of who changed what | Structured request logs (pino) with method, path, status                                                    | ✅     |
| No per-user audit trail       | Audit log of membership, project, task and file changes (who, what, when, IP); visible to owners and admins | ✅     |

### Information disclosure

| Threat                                                            | Mitigation                                                                                                    | Where                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| IDOR: reading another org's or client's project by changing an ID | Every project query is scoped with `visibleProjectsWhere()`; tasks are always looked up through their project | `projects.service.ts`, `tasks.service.ts` |
| Probing which organizations exist                                 | Non-members get `404`, not `403`                                                                              | `middleware/membership.ts`                |
| Leaking internals in errors                                       | Central error handler returns generic `500` messages; stack traces are only logged                            | `middleware/error-handler.ts`             |
| Secrets in logs                                                   | Cookies, auth headers, passwords and tokens are redacted                                                      | `lib/logger.ts`                           |
| Clickjacking, MIME sniffing                                       | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, CSP                                             | `helmet`, `next.config.ts`                |
| Invitation token leak from DB                                     | Invitation tokens are stored hashed and shown only once                                                       | `members.service.ts`                      |

### Denial of service

| Threat                                                      | Mitigation                                                    | Status |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| Request flooding                                            | Global API rate limit (600 requests / 15 min / IP)            | ✅     |
| Large payloads                                              | JSON body limit of 100 KB                                     | ✅     |
| Expensive password hashing used as DoS                      | Auth rate limit; password max length 128                      | ✅     |
| Rate limits reset on restart / not shared between instances | Redis store when `REDIS_URL` is set                           | ✅     |
| Huge uploads                                                | 10 MB limit; body is read only after permission checks        | ✅     |
| Slow email server blocking requests                         | Emails are sent from a background queue (BullMQ) with retries | ✅     |

### Elevation of privilege

| Threat                                         | Mitigation                                                           | Where                                           |
| ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| Client performing team actions                 | Permission matrix checked in every handler with `authorize()`        | `middleware/membership.ts`                      |
| Admin removing or demoting an owner            | `canManageMember()` rules, covered by tests                          | `shared/roles.ts`, `test/authorization.test.ts` |
| Accepting an invitation meant for someone else | Invitation only works for the invited email, once, before it expires | `organizations.service.ts`                      |
| Open redirect after login (`?next=//evil.com`) | Only relative paths are accepted                                     | `web/src/lib/format.ts`                         |

## Known gaps and planned work

| Gap                                                          | Risk                                                    | Plan                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| Registration reveals if an email is already used (`409`)     | Low: account enumeration, slowed by rate limiting       | Return a generic response and email the existing user instead   |
| CSP allows `'unsafe-inline'` scripts (needed by Next.js)     | Weaker XSS defense in depth                             | Nonce-based CSP via middleware                                  |
| No MFA                                                       | Password-only accounts                                  | Passkeys (WebAuthn) or TOTP                                     |
| Email payloads (with one-time links) sit in Redis until sent | Low: removed right after sending; Redis must be private | Keep Redis on a private network with auth/TLS                   |
| No malware scanning of uploads                               | Infected files could be shared between users            | Scan in a background job (ClamAV) before making files available |
| No storage quota per organization                            | Storage abuse                                           | Per-organization quota                                          |
| Login and password-reset events are not in the audit log     | Account-level events only in request logs               | Per-user security log                                           |

## How security is tested

- `apps/api/test/auth.test.ts`: password hashing, hashed sessions, generic login errors, logout,
  CSRF origin check, security headers, rate limiting.
- `apps/api/test/authorization.test.ts`: cross-organization access, client isolation (IDOR),
  read-only clients, role-change rules, invitation rules.
- `apps/api/test/email-flows.test.ts`: verification and reset links (single use, expiry, no account
  enumeration, sessions revoked), verified email required for invitations, HTML escaping in emails.
- `apps/api/test/files.test.ts`: type detection from content, HTML/SVG rejection, size limit,
  path traversal, attachment headers, client isolation, delete permissions, storage cleanup.
- `apps/api/test/audit.test.ts`: recorded events, access control, cursor pagination.
- `packages/shared/src/roles.test.ts`: the permission matrix itself.
