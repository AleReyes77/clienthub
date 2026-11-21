# ADR 0004: Biome for linting and formatting

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

The project needs consistent formatting and basic lint rules across the API, the web app and
the shared package, enforced in CI.

## Decision

Use [Biome](https://biomejs.dev) as a single tool for both linting and formatting, configured
once in `biome.json` at the repository root.

ESLint + Prettier was the alternative. It has more plugins, but needs several packages and
config files per workspace. Biome covers the rules this project needs, runs in milliseconds and
has one config file.

## Consequences

- `npm run lint` checks formatting and lint rules; `npm run format` fixes them.
- Framework-specific lint rules (for example the Next.js ESLint plugin) are not available.
  TypeScript strict mode and code review cover most of that gap.
