# Decisions

## 2026-09-20 — Greenfield authorization resolves the initial blocker

**Status:** Accepted. The previous empty-workspace blocker is **RESOLVED**.

The owner confirmed that the empty directory was intentional and supplied the DevPilot product brief. Git, application scaffolding, dependencies, database, UI, APIs, tests, CircleCI, and an empty environment example are explicitly authorized. The former decision not to build without a brief is superseded. Do not ask for an existing repository.

## 2026-09-20 — Single Next.js application and minimal platform dependencies

**Status:** Implemented; full application verification is in progress.

Use Next.js App Router and React for UI and same-origin APIs. PostgreSQL/pgvector with Drizzle provides durable owner-scoped data and vector search. Native crypto/fetch provide encryption, opaque sessions, and GitHub REST/OAuth. AI SDK with an OpenAI adapter provides structured generation and embeddings. Zod validates input and generated structures. Avoid a second backend framework, queue, execution sandbox, and unnecessary UI framework until justified.

## 2026-09-20 — Explicit, isolated development demo

**Status:** Implemented and unit tested; browser checks pending.

A demo session has a separate in-memory project map, one-hour expiry, and bounded storage/requests. It uses fictional sample source and deterministic source lookup/templates, always labeled as non-AI. Live operations never silently fall back to demo responses. Production demo is opt-in and requires a single process or sticky routing; it is not durable storage.

## 2026-09-20 — Immutable, bounded repository snapshots

**Status:** Implemented; live GitHub verification pending external configuration.

Pin source import to an immutable commit. Exclude sensitive filenames, generated directories, symlinks, binaries, unsupported files, and excessive line lengths. Bound source to 300 files, 2 MB, 100 KB per file, and 1,200 chunks. Reject truncated trees rather than silently pretending the index is complete. A project connects one snapshot; a new project can import a newer snapshot. No repository code or generated code is executed.

## 2026-09-20 — Project aggregate storage with relational ownership and embeddings

**Status:** Implemented and verified; PostgreSQL runtime verification pending an available database.

Store bounded project history as JSONB while keeping users, sessions, ownership, chunks, and embedding indexes relational. Updates take a per-project transaction lock to prevent lost writes. Index replacement and snapshot storage are atomic. This keeps the first product small; normalize conversations/artifacts/tasks and add paginated APIs when bounded histories no longer meet user needs.

## 2026-09-20 — Decouple external provider calls via atomic operation reservations

**Status:** Implemented, verified with unit/e2e tests, and reviewed.

External AI and GitHub operations must never run inside open database transactions to avoid connection pool starvation and deadlock. Instead, operations claim a 10-minute lease atomically (`operations` table with ON CONFLICT lease fencing in PostgreSQL, `demoOperations` map in demo mode). Provider work runs with no held DB connections. Mutating saves re-verify the lease and update the project in a brief locked transaction. Competing requests return HTTP 409 immediately before calling third-party APIs.

## 2026-09-20 — Production authentication and AI boundaries

**Status:** Implemented; independent security review in progress.

Use GitHub OAuth with state validation, opaque random sessions hashed at rest, HttpOnly/SameSite cookies, and AES-256-GCM provider access encryption. Scope every project access by owner. Require same-origin mutations and server-side validation. Private repository support currently requires GitHub OAuth's broad `repo` scope, although DevPilot only makes read calls. A GitHub App is the least-privilege upgrade for organization rollout.

Repository source is untrusted prompt data. Retrieval supplies bounded chunks and citations are resolved only against those chunks. There are no AI execution tools. Outputs are suggestions; no generated test is represented as executed. Users explicitly connect repositories and must be authorized to send their source to the configured provider.

## 2026-09-20 — Verification claims are evidence-based

**Status:** Ongoing.

Unit, type, lint, build, browser, database, and external-provider checks are recorded separately. A local passing build does not establish live integration or production readiness. Missing credentials block only the associated verification, not implementation or isolated checks.
