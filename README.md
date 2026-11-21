# ClientHub

[![CI](https://github.com/AleReyes77/clienthub/actions/workflows/ci.yml/badge.svg)](https://github.com/AleReyes77/clienthub/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

**A client portal for freelancers and small agencies.** Teams manage projects and tasks, and
each client gets a private view of the work being done for them.

I built ClientHub as a full stack reference project: a real-world problem I know from freelance
work, implemented with the same practices I use in production. That means clean module
boundaries, tests for the rules that matter, CI, and security designed in from the start
rather than added at the end.

> **Status:** v0.2. See the [roadmap](#roadmap) for what comes next.

## Features

- **Accounts and sessions**: registration and login with Argon2id password hashing and
  server-side sessions in `HttpOnly` cookies.
- **Email verification and password reset**: single-use links that expire; a reset logs out every device.
- **Organizations with roles**: `OWNER`, `ADMIN`, `MEMBER` and `CLIENT`, enforced on every API request.
- **Invitations by email**: single-use links, bound to the invited (and verified) email, valid for 7 days.
- **Projects and tasks**: status, client assignment, assignees, due dates and a task board.
- **Project files**: upload and share files with clients (images, PDF, Office, ZIP, text), with safe downloads.
- **Email notifications**: invitations and task assignments, sent from a background queue.
- **Audit log**: an activity page for owners and admins with who changed what and when.
- **Client isolation**: clients only see the projects where they are the client. They can share
  files there but cannot change projects or tasks.

## Tech stack

| Layer    | Technology                                                                             |
| -------- | -------------------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack Query          |
| Backend  | Node.js, Express 5, TypeScript, Zod, BullMQ (jobs), Nodemailer, Multer                 |
| Data     | PostgreSQL 17, Prisma 7, Redis, S3-compatible object storage                           |
| Security | Argon2id, helmet, express-rate-limit, origin-based CSRF protection                     |
| Quality  | Vitest, Supertest, Biome, GitHub Actions (with Postgres, Redis and S3Mock), Dependabot |
| Shared   | `packages/shared`: Zod schemas and permission rules used by **both** API and UI        |

## Architecture

```text
Browser ──▶ Next.js (apps/web) ──/api proxy──▶ Express API (apps/api) ──Prisma──▶ PostgreSQL
                    ▲                                    ▲
                    └────────── packages/shared ─────────┘
                       (validation schemas, roles, types)
```

- The browser only talks to one origin. `/api/*` is proxied to the API, so cookies stay first-party.
- The API is organized by feature (`modules/auth`, `modules/projects`, …), each with routes
  (HTTP) and a service (business rules).
- Every project query goes through one function that scopes it to the organization and, for
  clients, to their own projects. This is the main protection against IDOR.
- Email, background jobs and file storage sit behind small interfaces: Redis/SMTP/S3 in
  production, and simple in-process versions locally, so the app runs with only PostgreSQL.

Read more in [docs/architecture.md](docs/architecture.md) and the decision records in [docs/adr](docs/adr).

## Security

Security is part of the design. It is documented and tested:

- **Threat model (STRIDE)** with mitigations and known gaps: [docs/threat-model.md](docs/threat-model.md)
- Passwords hashed with **Argon2id** (OWASP parameters); session, invitation and email tokens stored as **SHA-256 hashes**
- **Password reset** done right: single-use, 1-hour links in the URL fragment, every session revoked, no account enumeration
- **Safe file uploads**: type detected from magic bytes, HTML/SVG rejected, random storage keys, downloads forced as attachments ([ADR 0006](docs/adr/0006-file-uploads.md))
- **Audit log** of membership, project, task and file changes
- **CSRF** protection with origin verification + `SameSite=Lax` ([ADR 0003](docs/adr/0003-csrf-protection.md))
- **Rate limiting** on auth endpoints and on the whole API, shared through Redis
- **IDOR protection** and a `404` for anything you are not allowed to see
- **Security headers** (CSP, `X-Frame-Options`, `nosniff`, HSTS) and secrets redacted from logs
- Integration tests that try to break these rules (cross-org access, client isolation, privilege escalation)

Found a vulnerability? See [SECURITY.md](SECURITY.md).

## Getting started

### Requirements

- Node.js 22.12+ (24 recommended, see `.nvmrc`)
- PostgreSQL: Docker **or** Prisma's local dev database (no Docker needed)

### 1. Install

```bash
git clone https://github.com/AleReyes77/clienthub.git
cd clienthub
npm install
cp apps/api/.env.example apps/api/.env
```

### 2. Start the services

Only PostgreSQL is required. Without Redis, SMTP or S3 the app uses simple local fallbacks:
jobs run in-process, emails are printed to the API log (with their links) and files go to `apps/api/uploads`.

**Option A: Docker** (PostgreSQL, Redis and Mailpit)

```bash
docker compose up -d
```

The default values in `apps/api/.env` already point to this database. To use the full stack,
also set `REDIS_URL=redis://localhost:6379` and `SMTP_URL=smtp://localhost:1025`, then read the
emails at http://localhost:8025. For integration tests, create the test database once:

```bash
docker compose exec postgres createdb -U clienthub clienthub_test
```

**Option B: without Docker**

```bash
cd apps/api
npx prisma dev -n clienthub -d        # development database
npx prisma dev -n clienthub-test -d   # test database (optional)
npx prisma dev ls                     # shows the connection URLs
```

Copy the `postgres://…` TCP URLs into `DATABASE_URL` and `TEST_DATABASE_URL` in `apps/api/.env`.

### 3. Create the tables and demo data

```bash
npm run db:migrate
npm run db:seed
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. The API runs on http://localhost:4000.

**Demo accounts** (password `clienthub-demo-2026`):

| Email                   | Role   | What to try                                                 |
| ----------------------- | ------ | ----------------------------------------------------------- |
| `owner@clienthub.test`  | Owner  | Manage projects, tasks and members, create invitations      |
| `member@clienthub.test` | Member | Work on tasks; cannot create projects or invite people      |
| `client@clienthub.test` | Client | Sees only the "Acme Corp" project and can share files there |

To try email verification or password reset without SMTP, register a new account and copy the
link printed in the API log.

## Scripts

| Command             | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `npm run dev`       | Runs the API and the web app with hot reload                   |
| `npm run lint`      | Lint and format check (Biome)                                  |
| `npm run format`    | Fixes formatting                                               |
| `npm run typecheck` | TypeScript checks in all packages                              |
| `npm test`          | Unit tests + API integration tests (needs `TEST_DATABASE_URL`) |
| `npm run build`     | Production build of the API and the web app                    |

## Testing

- **Unit tests** for the permission matrix and validation schemas (`packages/shared`).
- **Integration tests** for the API with Supertest against a real PostgreSQL database
  (`apps/api/test`). They cover authentication, CSRF, rate limiting, RBAC, IDOR, email flows,
  file uploads and the audit log.
- **Adapter tests**: the SMTP mailer against an in-process SMTP server, and the Redis (BullMQ,
  shared rate limits) and S3 adapters against real services when `TEST_REDIS_URL` /
  `TEST_S3_ENDPOINT` are set.
- CI runs lint, typecheck, migrations, all tests (with PostgreSQL, Redis and S3Mock) and the
  production build on every push and PR.

Integration tests are skipped when `TEST_DATABASE_URL` is not set. They wipe that database, so
never point it at real data.

## Project structure

```text
clienthub/
├── apps/
│   ├── api/                 Express API
│   │   ├── prisma/          schema, migrations, seed
│   │   ├── src/modules/     auth, organizations, members, projects, tasks, files, audit, notifications
│   │   └── test/            integration tests
│   └── web/                 Next.js app
├── packages/
│   └── shared/              Zod schemas, roles, API types
├── docs/                    architecture, ADRs, threat model, API reference
└── .github/                 CI workflow, Dependabot
```

## Roadmap

- [x] **v0.1:** auth, organizations, roles, invitations, projects, tasks, CI
- [x] **v0.2:** file uploads (S3-compatible storage), email notifications with a Redis queue
      (BullMQ), audit log, email verification and password reset
- [ ] **v0.3:** invoices and payments with Stripe (test mode) and webhooks
- [ ] **v0.4:** AI-generated weekly project summaries
- [ ] End-to-end tests with Playwright, nonce-based CSP, Docker images for the apps, deployment guide
- [ ] Malware scanning for uploads, storage quotas, MFA with passkeys

## API

The full list of endpoints is in [docs/api.md](docs/api.md).

## License

[MIT](LICENSE) © Jose Alejandro Varela Reyes
