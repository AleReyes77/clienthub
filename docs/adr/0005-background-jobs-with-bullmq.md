# ADR 0005: Background jobs with BullMQ, with an in-process fallback

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

v0.2 sends emails (verification, password reset, invitations, task assignments) and deletes
files from storage. Doing that inside the HTTP request would make responses slow and would fail
the user's action whenever the mail server or storage has a hiccup.

## Decision

All slow or failure-prone side effects go through a small `JobQueue` interface
(`apps/api/src/lib/queue.ts`) with two implementations:

- **BullMQ on Redis** when `REDIS_URL` is set: jobs are persisted, retried 5 times with
  exponential backoff, and finished jobs are removed (email payloads contain one-time links).
- **Inline queue** without Redis: runs the job in the same process right after the response.
  No persistence and no retries, so it is meant for local development and tests only.

Job names and payloads are typed in one place (`JobPayloads`), so adding a job without a handler
is a compile error. The worker runs inside the API process for now; it can move to its own
process without changing the callers.

Alternatives considered:

- **PostgreSQL-based queue (e.g. pg-boss):** no extra infrastructure, but Redis is also needed for
  shared rate limiting, and BullMQ is the most common choice in the Node.js ecosystem.
- **Sending directly in the request:** simplest, but couples user actions to third-party uptime.

## Consequences

- Production needs Redis. Local development works without it.
- The BullMQ path is covered by an integration test that runs in CI against a real Redis.
- Emails are "at least once": a retried job may in rare cases send a duplicate email.
