# ADR 0001: Monorepo with npm workspaces

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

The web app and the API need the same validation rules, roles and response types.
Duplicating them would let the frontend and backend drift apart.

## Decision

Use a single repository with npm workspaces:

- `apps/api`: Express API
- `apps/web`: Next.js app
- `packages/shared`: Zod schemas, roles and types used by both

The shared package ships TypeScript source. Next.js compiles it with `transpilePackages`,
and the API bundles it with `tsup`.

npm workspaces were chosen over pnpm or Turborepo because they come with Node.js
(no extra tooling for contributors) and are enough for three packages.

## Consequences

- One change to a schema updates both form validation and API validation.
- One CI pipeline checks everything together.
- If the repository grows to many packages, a build cache such as Turborepo may be worth adding.
