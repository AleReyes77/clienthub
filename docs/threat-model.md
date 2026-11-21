# Threat model

This document lists what ClientHub protects, the main threats (using **STRIDE**), how each one
is mitigated in the code, and the gaps that are known and planned.

_Last reviewed: 2026-11-21 (v0.1)._

## What we protect

| Asset                             | Why it matters                                         |
| --------------------------------- | ------------------------------------------------------ |
| User accounts and passwords       | Account takeover gives access to client data           |
| Session tokens                    | A stolen token is equivalent to a logged-in user       |
| Client project data               | Clients must never see each other's work               |
| Organization membership and roles | Role changes control who can see and change everything |
| Invitation links                  | An invitation grants access to an organization         |

## Trust boundaries

```text
[ Browser ] ──HTTPS──▶ [ Next.js (web) ] ──proxy──▶ [ Express API ] ──▶ [ PostgreSQL ]
  untrusted               serves UI only             enforces all rules    trusted
```

The web app only hides actions the user cannot perform. **All authorization is enforced by the API.**

## STRIDE analysis

### Spoofing (pretending to be someone else)

| Threat                                  | Mitigation                                                         | Where                                |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| Password guessing / credential stuffing | Login and register limited to 10 requests per 15 min per IP        | `middleware/rate-limit.ts`           |
| Weak passwords                          | Minimum 12 characters (length over complexity, NIST 800-63B)       | `shared/schemas.ts`                  |
| Offline cracking after a DB leak        | Argon2id with OWASP parameters (19 MiB, 2 iterations)              | `lib/password.ts`                    |
| Account enumeration via login           | Same error and similar timing for unknown email and wrong password | `auth.service.ts`, `lib/password.ts` |
| Session theft via XSS                   | Session cookie is `HttpOnly`, so scripts cannot read it            | `auth.routes.ts`                     |
| Session theft via DB leak               | Only SHA-256 hashes of session tokens are stored                   | `lib/tokens.ts`                      |

### Tampering (changing data without permission)

| Threat                             | Mitigation                                                                                                     | Where                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| CSRF                               | Origin check on every state-changing request + `SameSite=Lax`                                                  | `middleware/origin-check.ts`, [ADR 0003](adr/0003-csrf-protection.md) |
| Mass assignment                    | Bodies are parsed with strict Zod schemas; only listed fields reach the DB                                     | `shared/schemas.ts`, `lib/validate.ts`                                |
| SQL injection                      | All queries go through Prisma (parameterized)                                                                  | services                                                              |
| Privilege escalation through roles | Nobody can change their own role; only owners can change or create owners; invitations can never grant `OWNER` | `shared/roles.ts`, `members.service.ts`                               |

### Repudiation (denying an action)

| Threat                        | Mitigation                                               | Status            |
| ----------------------------- | -------------------------------------------------------- | ----------------- |
| No record of who changed what | Structured request logs (pino) with method, path, status | ✅                |
| No per-user audit trail       | Audit log table (who, what, when)                        | ⏳ Planned for v2 |

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

| Threat                                                      | Mitigation                                         | Status |
| ----------------------------------------------------------- | -------------------------------------------------- | ------ |
| Request flooding                                            | Global API rate limit (600 requests / 15 min / IP) | ✅     |
| Large payloads                                              | JSON body limit of 100 KB                          | ✅     |
| Expensive password hashing used as DoS                      | Auth rate limit; password max length 128           | ✅     |
| Rate limits reset on restart / not shared between instances | Move rate-limit store to Redis                     | ⏳ v2  |

### Elevation of privilege

| Threat                                         | Mitigation                                                           | Where                                           |
| ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| Client performing team actions                 | Permission matrix checked in every handler with `authorize()`        | `middleware/membership.ts`                      |
| Admin removing or demoting an owner            | `canManageMember()` rules, covered by tests                          | `shared/roles.ts`, `test/authorization.test.ts` |
| Accepting an invitation meant for someone else | Invitation only works for the invited email, once, before it expires | `organizations.service.ts`                      |
| Open redirect after login (`?next=//evil.com`) | Only relative paths are accepted                                     | `web/src/lib/format.ts`                         |

## Known gaps and planned work

| Gap                                                      | Risk                                              | Plan                            |
| -------------------------------------------------------- | ------------------------------------------------- | ------------------------------- |
| Registration reveals if an email is already used (`409`) | Low: account enumeration, slowed by rate limiting | Email verification flow in v2   |
| No email verification or password reset                  | Users cannot recover accounts                     | v2 (with background email jobs) |
| CSP allows `'unsafe-inline'` scripts (needed by Next.js) | Weaker XSS defense in depth                       | Nonce-based CSP via middleware  |
| No MFA                                                   | Password-only accounts                            | Passkeys (WebAuthn) or TOTP     |
| No audit log                                             | Hard to investigate incidents                     | v2                              |
| In-memory rate limiting                                  | Not shared across instances                       | Redis store in v2               |

## How security is tested

- `apps/api/test/auth.test.ts`: password hashing, hashed sessions, generic login errors, logout,
  CSRF origin check, security headers, rate limiting.
- `apps/api/test/authorization.test.ts`: cross-organization access, client isolation (IDOR),
  read-only clients, role-change rules, invitation rules.
- `packages/shared/src/roles.test.ts`: the permission matrix itself.
