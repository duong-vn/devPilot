# DevPilot

An AI-native developer workspace: connect a GitHub repository, ask questions with source citations, and turn ideas into specifications, implementation plans, and actionable tasks. Review source and generate test suggestions without executing repository code.

## Quick start — no external services

Requires Node.js 22.13+ and npm. Node.js 24 LTS is recommended.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and choose the demo. The demo uses a fictional TypeScript task service, deterministic source lookup, and explicitly labeled planning templates. It is **not live AI** and does not contact GitHub or an AI provider. Each browser session has isolated data, expires after one hour, and loses data on process restart. Demo mode is disabled in production unless `ENABLE_DEMO=true` is explicitly configured. Production demos require one application process or sticky routing; do not use the demo as persistent storage.

## Real integrations

Create `.env.local` from the provided `.env.example` and fill it locally. Never commit real configuration.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Canonical application origin, HTTPS in production |
| `DATABASE_URL` | PostgreSQL connection configuration, preferably TLS in production |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth application configuration |
| `SESSION_ENCRYPTION_KEY` | 32-byte hexadecimal key for encrypting GitHub access material at rest |
| `OPENAI_API_KEY` | Server-only provider access for generation and embeddings |
| `OPENAI_CHAT_MODEL` | Provider model; defaults to `gpt-4.1-mini` |
| `ENABLE_DEMO` | Explicitly enable ephemeral demo in production when set to `true` |

Generate the encryption key locally with Node crypto, as described in the example file. Rotating it invalidates decryption of existing GitHub sessions; sign in again after rotation.

### PostgreSQL and pgvector

Use PostgreSQL with the `vector` extension. `compose.yaml` provides a local PostgreSQL 17 instance with pgvector, bound only to loopback. Set `POSTGRES_PASSWORD` in your shell before starting it; there is no built-in password.

```sh
docker compose up -d
# Set DATABASE_URL in your shell for this command, or load your local configuration yourself.
npm run db:migrate
```

The migration command uses a transaction, advisory lock, and checksum ledger. It does not automatically read environment files. The initial migration needs permission to create the vector extension; a database administrator may need to enable it first. Back up the database before applying future migrations. Never edit a migration after it has been applied.

No seed command is needed. Real projects begin empty; the isolated demo supplies its own sample data.

To stop the local database without removing its data:

```sh
docker compose stop
```

### GitHub OAuth

Create a GitHub OAuth application with callback URL:

```text
http://localhost:3000/api/auth/github/callback
```

Use your HTTPS `APP_URL` for deployment. GitHub OAuth requests `read:user` and `repo` to support private repositories. GitHub's OAuth `repo` permission is broader than read-only; DevPilot only calls read APIs and never pushes code. If that scope is unacceptable, use a dedicated account with access only to approved repositories. A least-privilege GitHub App is the recommended next integration for organization-wide rollout.

### Indexing and AI

Connecting a repository is an explicit action. Its supported source files are fetched from GitHub at an immutable commit, filtered, chunked with line ranges, sent to the configured provider for embeddings, and stored in PostgreSQL. Questions use lexical plus pgvector retrieval. The AI receives only selected context, recent bounded conversation, and the user's request.

Do not connect a repository unless you are authorized to send its source to the configured AI provider. Filename exclusions are a defense, not a guarantee that source contains no sensitive data. Provider retention and processing terms apply.

Current ingestion limits: 300 source files, 2 MB of source, 100 KB per file, and 1,200 chunks. Generated directories, binary files, environment files, and sensitive filenames are excluded. Symlinks are not followed. Large or truncated repositories are rejected rather than silently partially indexed. This version uses an immutable snapshot per project; create another project to import a newer snapshot.

Specs can be converted into plans; plans can be converted into tasks once. Reviews and proposed tests are suggestions, not verified execution. Generated code is never executed or pushed.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

CircleCI runs these checks without live credentials. Browser tests use `npm run test:e2e` once a local test server is running and Playwright Chromium is installed (`npx playwright install chromium`). Override the target with `TEST_BASE_URL` when using another local port.

The PostgreSQL integration test runs only when `TEST_DATABASE_URL` explicitly points to a disposable PostgreSQL/pgvector test database. It never uses `DATABASE_URL` implicitly and rolls back its writes. Without that variable, the test is reported as skipped, not passed. Mocked provider tests do not contact external services. See project progress for checks actually executed in the current environment.

## Architecture and security

- Next.js App Router and React with strict TypeScript and Tailwind CSS.
- Drizzle ORM and PostgreSQL; project-owned source chunks use pgvector.
- Opaque, hashed database sessions in HttpOnly, SameSite cookies; encrypted provider access at rest.
- Every project query is owner-scoped. Every mutation requires the configured same origin.
- Zod validation, bounded input, per-user operation budgets, provider timeouts, and atomic persistence.
- Repository snippets are untrusted prompt data. There are no execution tools and no raw HTML rendering.
- Small project aggregates are stored as JSONB, with relational ownership/session/chunk boundaries. Normalize message and artifact tables when project history needs pagination beyond current limits.

## Deployment

1. Provision PostgreSQL with pgvector, backups, and a least-privilege application account.
2. Configure server-only variables and an HTTPS canonical origin. Do not prefix sensitive values with `NEXT_PUBLIC_`.
3. Apply migrations using a separately authorized migration account.
4. Run `npm ci` and `npm run build`; start with `npm start` behind an HTTPS reverse proxy. The default start command binds loopback; container platforms may override to `next start --hostname 0.0.0.0`.
5. Set request limits and authentication-start rate limits at the ingress. Keep demo disabled for normal production deployments.
6. Allow up to 300 seconds for synchronous bounded import and 90 seconds for generation routes, or move ingestion to a background job before deploying to shorter-timeout platforms.
7. Periodically purge expired `sessions` and `usage` rows. Monitor error rates and database connections without logging source, prompts, or access material.
8. Verify OAuth callback, database persistence, provider generation/embeddings, tenant isolation, and restore procedures in the actual deployment before declaring production readiness.

No deployment or live-provider validation is implied by a successful local build. See `docs/PROJECT_STATE.md`, `docs/BACKLOG.md`, and `docs/PROGRESS.md` for verified status and remaining work.
