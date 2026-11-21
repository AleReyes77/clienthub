# ClientHub

[![CI](https://github.com/AleReyes77/clienthub/actions/workflows/ci.yml/badge.svg)](https://github.com/AleReyes77/clienthub/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?logo=postgresql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

**A client portal for freelancers and small agencies.** Teams manage projects and tasks, and
each client gets a private view of the work being done for them.

I built ClientHub as a full stack reference project: a real-world problem I know from freelance
work, implemented with the same practices I use in production. That means clean module
boundaries, tests for the rules that matter, CI, and security designed in from the start
rather than added at the end.

> **Status:** v0.1 (MVP). See the [roadmap](#roadmap) for what comes next.

## Features

- **Accounts and sessions**: registration and login with Argon2id password hashing and
  server-side sessions in `HttpOnly` cookies.
- **Organizations with roles**: `OWNER`, `ADMIN`, `MEMBER` and `CLIENT`, enforced on every API request.
- **Invitations**: single-use links, bound to the invited email and valid for 7 days.
- **Projects and tasks**: status, client assignment, assignees, due dates and a task board.
- **Client isolation**: clients only see the projects where they are the client, with read-only access.

## Tech stack

| Layer    | Technology                                                                      |
| -------- | ------------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, TanStack Query   |
| Backend  | Node.js, Express 5, TypeScript, Zod                                             |
| Database | PostgreSQL 17, Prisma 7                                                         |
| Security | Argon2id, helmet, express-rate-limit, origin-based CSRF protection              |
| Quality  | Vitest, Supertest, Biome, GitHub Actions, Dependabot                            |
| Shared   | `packages/shared`: Zod schemas and permission rules used by **both** API and UI |

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

Read more in [docs/architecture.md](docs/architecture.md) and the decision records in [docs/adr](docs/adr).

## Security

Security is part of the design. It is documented and tested:

- **Threat model (STRIDE)** with mitigations and known gaps: [docs/threat-model.md](docs/threat-model.md)
- Passwords hashed with **Argon2id** (OWASP parameters); session and invitation tokens stored as **SHA-256 hashes**
- **CSRF** protection with origin verification + `SameSite=Lax` ([ADR 0003](docs/adr/0003-csrf-protection.md))
- **Rate limiting** on login/registration and on the whole API
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

### 2. Start a database

**Option A: Docker**

```bash
docker compose up -d
```

The default values in `apps/api/.env` already point to this database. For integration tests,
create the test database once:

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

| Email                   | Role   | What to try                                            |
| ----------------------- | ------ | ------------------------------------------------------ |
| `owner@clienthub.test`  | Owner  | Manage projects, tasks and members, create invitations |
| `member@clienthub.test` | Member | Work on tasks; cannot create projects or invite people |
| `client@clienthub.test` | Client | Sees only the "Acme Corp" project, read-only           |

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
  (`apps/api/test`). They cover authentication, CSRF, rate limiting, RBAC and IDOR.
- CI runs lint, typecheck, migrations, all tests and the production build on every push and PR.

Integration tests are skipped when `TEST_DATABASE_URL` is not set. They wipe that database, so
never point it at real data.

## Project structure

```text
clienthub/
├── apps/
│   ├── api/                 Express API
│   │   ├── prisma/          schema, migrations, seed
│   │   ├── src/modules/     auth, organizations, members, projects, tasks
│   │   └── test/            integration tests
│   └── web/                 Next.js app
├── packages/
│   └── shared/              Zod schemas, roles, API types
├── docs/                    architecture, ADRs, threat model, API reference
└── .github/                 CI workflow, Dependabot
```

## Roadmap

- [x] **v0.1:** auth, organizations, roles, invitations, projects, tasks, CI
- [ ] **v0.2:** file uploads (S3-compatible storage), email notifications with a Redis queue
      (BullMQ), audit log, email verification and password reset
- [ ] **v0.3:** invoices and payments with Stripe (test mode) and webhooks
- [ ] **v0.4:** AI-generated weekly project summaries
- [ ] End-to-end tests with Playwright, nonce-based CSP, Docker images for the apps, deployment guide

## API

The full list of endpoints is in [docs/api.md](docs/api.md).

## License

[MIT](LICENSE) © Jose Alejandro Varela Reyes
