# Authoro

**The record behind the work.** Authoro is a public provenance registry for creative work. Authors, and the tools they create with, submit evidence of how a work was made. Authoro fingerprints it, records who asserted what, and resolves it at a permanent public URL that readers reach by clicking the Authoro Mark.

Authoro verifies claims. It doesn't manufacture certainty: it never labels a work "human" or "AI" and never scores it. See [`Authoro-prd`](./Authoro-prd) for the full product requirements.

## Status

**V0, the public registry loop**, is complete: register → fingerprint → attest → mark → resolve, plus new versions, withdrawal and public author pages. Progress and the chunk plan are in [`docs/roadmap.md`](./docs/roadmap.md), and design decisions are logged in [`docs/decisions.md`](./docs/decisions.md).

## Repository layout

| Path                               | What                                                                                                                                                            | License    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [`packages/core`](./packages/core) | `@authoro/core`: Authoro IDs, document fingerprints (`authoro-text/1`), Proof Envelope schema, attestation primitives, verification. Runs in browsers and Node. | Apache-2.0 |
| [`apps/web`](./apps/web)           | The registry: a Next.js app with a Postgres database (Drizzle ORM) and Better Auth.                                                                             | AGPL-3.0   |

## Getting started

Requirements: Node 22+, pnpm 10, and Postgres 16 (`docker compose up -d` starts one).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env   # then set BETTER_AUTH_SECRET
docker compose up -d                     # local Postgres on :5432
pnpm db:migrate                          # apply migrations
pnpm dev                                 # http://localhost:3000
```

Without `RESEND_API_KEY`, development prints every email to the server console, including verification, sign-in and password-reset links, so you can sign up locally with any address.

The integration tests need a separate database, set by `TEST_DATABASE_URL` in `apps/web/.env`, and they wipe it on every run:

```bash
docker compose exec postgres createdb -U authoro authoro_test
```

Deploying: see [`docs/deploy.md`](./docs/deploy.md) (Vercel + Neon Postgres + Resend).

API: see [`docs/api.md`](./docs/api.md). Looking up and verifying records needs no key.

## Scripts

| Command                        | Does                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `pnpm dev`                     | Run the web app in development                                 |
| `pnpm test`                    | Unit tests (core) and database integration tests (web)         |
| `pnpm typecheck` / `pnpm lint` | Static checks across the workspace                             |
| `pnpm build`                   | Production build                                               |
| `pnpm db:generate`             | Generate a migration after editing `apps/web/src/db/schema.ts` |
| `pnpm db:migrate`              | Apply migrations to `DATABASE_URL`                             |

## Licensing

The protocol is open and the registry is copyleft. `@authoro/core` (spec, fingerprinting, verification) is Apache-2.0 so any tool can adopt it. The registry server is AGPL-3.0. The Authoro name and mark are trademarks and are not licensed by either. See [`LICENSING.md`](./LICENSING.md).
