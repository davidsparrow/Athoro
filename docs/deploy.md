# Deploying to Vercel

The registry (`apps/web`) deploys to Vercel from GitHub: every push to `main` goes to production, and every pull request gets a preview deployment.

## One-time setup

1. **Import the repository.** In Vercel choose _Add New → Project_ and import `davidsparrow/Authoro`.
   - **Root Directory:** `apps/web`. Leave "Include files outside the root directory" on, because the app uses `packages/core`.
   - The framework (Next.js), the pnpm install and the build command (`pnpm vercel-build`, from `apps/web/vercel.json`) are picked up automatically.
2. **Add a Postgres database.** In the project's _Storage_ tab, create a **Neon** database and connect it to the project. This sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, used for migrations).
   - Recommended: enable Neon's option to create a **database branch for each preview deployment**, then set `AUTHORO_MIGRATE_PREVIEWS=true` (below) so previews run their own migrations without touching production data.
   - Any other Postgres 16 works too: set `DATABASE_URL` yourself, pointing it at a transaction-mode pooler for serverless use.
3. **Set environment variables** (_Settings → Environment Variables_):

   | Variable                   | Production | Preview  | Notes                                                                                                                                                             |
   | -------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `BETTER_AUTH_SECRET`       | ✓          | ✓        | Session signing secret, 32+ characters: `openssl rand -base64 32`. Use different values per environment.                                                          |
   | `NEXT_PUBLIC_APP_URL`      | ✓          | —        | `https://authoro.net` once the domain is attached. When it's unset, production uses the project's production domain and previews use their own URL automatically. |
   | `RESEND_API_KEY`           | ✓          | optional | Without it, production refuses to send email, and previews print emails (including sign-in links) to the function logs.                                           |
   | `EMAIL_FROM`               | ✓          | optional | For example `Authoro <no-reply@authoro.net>`. The domain must be verified in Resend.                                                                              |
   | `AUTHORO_MIGRATE_PREVIEWS` | —          | `true`   | Only when each preview has its own database branch.                                                                                                               |
   | `CRON_SECRET`              | ✓          | —        | `openssl rand -base64 32`. Vercel Cron sends it to `/api/cron/embargoes`; without it the route answers 404 and embargo releases are only recorded when read.      |
   | `AUTHORO_ALL_PRO`          | optional   | optional | `true` gives every account Pro features. Until billing (chunk 10) exists, it's the only way to use private, unlisted and embargoed records.                       |

4. **Attach the domain.** Under _Settings → Domains_, add `authoro.net`, then set `NEXT_PUBLIC_APP_URL=https://authoro.net` and redeploy.
5. **Verify the sending domain in Resend.** Add `authoro.net` in Resend, create the DNS records it lists (SPF, DKIM, and optionally DMARC), then create an API key for `RESEND_API_KEY`.

## What happens on each deploy

`pnpm vercel-build` runs `src/db/deploy.ts` and then `next build`:

- **Production:** applies pending migrations (over `DATABASE_URL_UNPOOLED` when set), then builds. A failed migration fails the deploy, so the previous version keeps serving.
- **Preview:** skips migrations unless `AUTHORO_MIGRATE_PREVIEWS=true`. Without per-preview database branches, a preview that includes a new migration runs against the old schema until the change reaches production.

Migrations are additive and generated from `apps/web/src/db/schema.ts` (`pnpm db:generate`). The integrity triggers are part of the migration history, so a fresh database gets them automatically.

## Operational notes

- **Region:** put the Vercel functions in the same region as the database (_Settings → Functions_).
- **Embargo releases.** A record becomes public at its scheduled time on the first read after it, so the timing is exact without a scheduler. The daily cron in `vercel.json` (00:07 UTC, which the Hobby plan allows) records releases nobody has viewed yet and emails their authors. On a paid plan it can run hourly.
- **Rate limits** for sign-in, sign-up and email links are stored in Postgres (`rate_limit` table), so they hold across serverless instances.
- **Logs:** audit events live in the `audit_events` table (IPs stored only as keyed hashes). Emails that weren't sent appear in the function logs.
- **Passkeys are tied to the domain** in `NEXT_PUBLIC_APP_URL` (its hostname is the WebAuthn relying party ID). Set the production domain before people add passkeys: passkeys made on another domain won't work after a move. On previews, a passkey works only on the URL it was added on (the branch URL), not the deployment's hashed URL.
