# Backlog

Updated: 2026-09-20

## Resolved prerequisite

**M0-02 — Identify the project: DONE / RESOLVED.** The owner supplied the DevPilot greenfield brief and authorized immediate implementation.

## Active queue

| ID | Priority | Status | Task and acceptance |
| --- | --- | --- | --- |
| DP-01 | P0 | DONE | Bootstrap Next.js/React/TypeScript/Tailwind, shared contracts, dependency lockfile, and Git. Typecheck and production build execute successfully. |
| DP-02 | P0 | DONE | Implement bounded GitHub source ingestion and line-accurate retrieval with regression tests for hostile/oversized/sensitive paths. |
| DP-03 | P0 | DONE | Implement PostgreSQL/pgvector schema, authentication, isolated demo, same-origin APIs, and project ownership checks with tests. |
| DP-04 | P0 | DONE | Build accessible responsive dashboard, project creation, repository connection, source browser, and cited conversation. |
| DP-05 | P0 | DONE | Implement AI SDK RAG and stored specs/plans/tasks/reviews/test suggestions; distinguish demo from live AI. |
| DP-06 | P0 | DONE | Verify full demo workflow and failure cases with Playwright browser automation and API tests; all 8 e2e tests passing. |
| DP-07 | P1 | DONE | Add CircleCI, database setup, environment example, deployment/security documentation; run full applicable validation. |
| DP-08 | P1 | BLOCKED | Verify real GitHub OAuth and remote import against an authorized account. Requires owner-configured OAuth application; implementation and mocks pass. |
| DP-09 | P1 | BLOCKED | Verify live AI chat/embeddings and deployment database. Requires provider access and deployment database; local checks and mocks pass. |
| DP-10 | P0 | DONE | Decouple external AI/GitHub work from DB transactions using atomic project operation leases; independent quota partitions, task count checks, and unit/API tests verified. |
| DP-11 | P1 | BLOCKED | Run PostgreSQL/pgvector integration check with `TEST_DATABASE_URL`; Docker Linux daemon is unavailable and no local PostgreSQL executable was found. |

Every completed implementation task requires observed verification evidence in `docs/PROGRESS.md`. No task may be marked DONE based only on generated code.
