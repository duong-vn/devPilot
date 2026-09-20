# Project State

Updated: 2026-09-20

## Product and authorization

**DevPilot** is an AI-native developer workspace built greenfield from the owner's explicit brief. The former empty-repository blocker is **RESOLVED**.

Primary workflow: sign in, create a project, connect GitHub, index source into an immutable snapshot, ask repository-grounded questions with file/line citations, generate specifications, derive implementation plans, convert plans into actionable tasks, and request code reviews and test suggestions through a polished dashboard.

## Architecture

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4; PostgreSQL with pgvector and Drizzle ORM; AI SDK with OpenAI provider; native GitHub REST/OAuth; Zod; Node test runner and Playwright; CircleCI. Server code owns authentication, authorization, data access, repository ingestion, and AI calls. The browser never receives provider credentials.

A clearly labeled ephemeral demo uses sample source and deterministic non-AI responses, with per-session isolation. Production persists to PostgreSQL and fails explicitly when integrations are unavailable.

Concurrency and external provider calls are gated by atomic 10-minute project operation leases (`operations` table in PostgreSQL, `demoOperations` map in demo mode), decoupling expensive AI/GitHub requests from database transactions and preventing connection-pool starvation.

## Current state

- **Milestone:** M1 — runnable vertical slice COMPLETE and fully verified.
- **Verification status:**
  - `npm run typecheck`: clean, 0 errors.
  - `npm test`: 24 passing unit/mock tests, 1 skipped (disposable database test skipped when `TEST_DATABASE_URL` is unset).
  - `npm run lint`: Biome clean across all files, 0 errors.
  - `npm run build`: Next.js production build succeeds, 9 static pages, 9 dynamic route handlers.
  - `npm run test:e2e`: 8 passing Playwright tests (6 API/boundary tests, 2 full browser UI tests covering landing, demo mode, codebase chat with citations, source viewer, specs/plans/tasks generation, task status updates, and dialog accessibility).
  - `npm audit`: 0 vulnerabilities.
- **Background processes:**
  - Verification dev server runs on `http://127.0.0.1:3000`, PID 17724.
  - Stop command: `taskkill //PID 17724 //T //F`.
- **External blockers (configuration only):**
  - DP-08: Live GitHub OAuth with real application credentials.
  - DP-09: Live AI provider requests and deployed PostgreSQL database.
  - DP-11: Local Docker engine is unavailable, preventing local containerized PostgreSQL runtime test execution.

## Constraints and resume

Tenant isolation, same-origin mutations, bounded ingestion (300 files / 2 MB), prompt-injection defenses, and honest demo labeling are verified. Never execute repository source. Never read sensitive environment files.
