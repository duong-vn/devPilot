# Progress

## 2026-09-20 — Milestone 1: Runnable vertical slice complete and verified

- **Production build:** `next build` compiled in 591ms, 9 static pages, 9 dynamic route handlers.
- **Static analysis & formatting:** `tsc --noEmit` and `biome check .` clean across all 45 files, 0 errors, 0 warnings.
- **Unit & regression suite:** 24 passed, 0 failed, 1 skipped (`TEST_DATABASE_URL` unset). Tests cover AES-256-GCM encryption/tamper defense, session hashing, CORS/origin enforcement, JSON bounds, canonical repository parsing, sensitive/generated/binary path filtering, exact chunk line bounds, lexical retrieval, GitHub commit pinning, stream caps, safe upstream error masking, citation IDs validation, artifact parent validation, independent demo quota partitions, task count ceiling, and operation lease mutual exclusion and failure release.
- **Concurrency & reservation redesign (DP-10):** Independent backend code review clean verdict. Decoupled AI and GitHub API calls from database transactions using 10-minute operation reservations (`operations` table with ON CONFLICT lease fencing in PostgreSQL, `demoOperations` in demo mode).
- **Full browser UI automation (Playwright):** All 8 e2e tests passed in 5.2s.
  - Landing page rendering, brand and workflow previews.
  - Demo entry, pre-seeded sample Orbit project.
  - Codebase conversation with citations to source.
  - Source viewer dialog opening with exact line-range highlighting.
  - Specifications generation, deriving implementation plans linked to parent specifications.
  - Breaking plans into actionable tasks and updating task status to "Done".
  - Account and deployment settings, honest non-AI demo disclosure, sign out.
  - Dialog accessibility: focus trapping, Escape key dismiss.
- **External blockers:** Live GitHub OAuth with real keys (DP-08), live AI provider requests and deployed database (DP-09), local Docker daemon unavailable for containerized PostgreSQL check (DP-11).

## 2026-09-20 — Demo API vertical slice verified

- Ran 18 passing Node checks; one PostgreSQL integration check is explicitly skipped without `TEST_DATABASE_URL`. Mocked GitHub tests verify immutable commit import, exclusion-before-fetch, oversized/truncated rejection, response size bounds, and safe upstream errors.
- Started the local verification server on port 3000, PID 17724. The user received the stop command `taskkill //PID 17724 //T //F`. This process is still running for browser verification; reassess its actual status on resume.
- All 3 Playwright API tests passed: full demo chat/specification/plan/task/review/test journey, cross-origin/unauthenticated/cross-session rejection, and empty-project import behavior.
- Added a disposable-database integration test that rolls back its writes and checks migration, foreign keys, owner filtering, rollback, and pgvector distance. It remains unverified locally because Docker's Linux daemon is unavailable.
- Frontend and independent backend review are still in progress. Full production build and UI interaction tests remain pending.

## 2026-09-20 — Core backend implemented; verification in progress

- Initialized Git and `feat/devpilot`; installed locked Next.js 16.3.5, React 19.3.0, AI SDK 7.0.107, Drizzle, PostgreSQL client, Zod, Tailwind, and verification tools.
- Implemented bounded GitHub ingestion, line-preserving chunks, lexical/vector retrieval, explicit sample mode, OAuth/session architecture, owner-scoped APIs, atomic project mutations, and AI-backed chat/specification/plan/task/review/test workflows.
- Added PostgreSQL/pgvector schema and checksummed transactional migration runner, CircleCI validation config, local database compose config, and setup/security documentation.
- Verified 13 Node tests passing, TypeScript passing, and production dependency audit reporting zero vulnerabilities. UI implementation is in progress separately; production build and browser workflow have not run yet.
- Initial Biome run found formatting and several lint findings; formatting was applied and remaining findings are being fixed. Do not treat lint as passed yet.
- Docker CLI is installed, but its Linux daemon is unavailable (`dockerDesktopLinuxEngine` pipe missing). Local PostgreSQL integration verification is blocked by that environment limitation, not application implementation.
- No dev server or database process has been started. Live OAuth/AI verification remains individually blocked on external configuration.

Next: finish frontend, fix remaining lint, run production build and browser/API workflow tests, address independent backend review findings.

Data-layer ceiling: project histories are bounded JSONB aggregates; source embeddings live in relational pgvector rows. Imports are immutable snapshots and do not execute repository code.

## 2026-09-20 — Greenfield brief received; blocker RESOLVED

The owner explicitly defined DevPilot, authorized architecture and implementation decisions, and confirmed there is no existing repository. M0-02 and the dependent baseline blocker are RESOLVED. Historical blocked entries below are retained as history only.

Execution begins from `plans/2026-09-20-devpilot.md`: bootstrap, bounded repository ingestion, authenticated persistence, dashboard, RAG/planning, tests and CircleCI. Live external verification will be tracked separately; missing credentials do not block local implementation. Node v24.19.0, npm 11.17.0, and Git 2.55.0 are installed.
