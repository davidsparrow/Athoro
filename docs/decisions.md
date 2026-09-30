# Decision log

Short records of choices that shape the codebase. Newest last.

## 001: Stack: Next.js + Postgres (Drizzle) + Better Auth

**Decided:** 2026-09-30, with the product owner.
Next.js 16 (App Router) for web and API. Plain Postgres through Drizzle ORM, so any host works (Supabase, Neon, RDS, self-hosted). Better Auth for accounts, since it is self-hostable and has passkey and MFA plugins, both PRD security requirements. We chose this over Supabase Auth and Storage to keep the open-source registry portable.

## 002: Licensing: AGPL server, Apache-2.0 protocol

**Decided:** 2026-09-30, with the product owner. See `LICENSING.md`.

## 003: Monorepo with an isomorphic core package

`@authoro/core` holds everything a third party needs to interoperate: IDs, fingerprinting, envelope schema, attestation hashing and verification. It uses only Web Crypto, so the same code fingerprints documents in the browser, the server, and future SDKs, MCP servers and plugins.

## 004: Identifiers

- Proof ID: `AU-` plus 6 Crockford base32 characters (for example `AU-7K3F92`), one per registered version and resolved at `/p/<id>`. Parsing is forgiving (case, missing hyphen, O/0 and I/L/1 confusion, pasted URLs). The body can grow to 12 characters later without breaking parsers.
- Work ID: `AUW-` plus 8 characters, for the conceptual work in APIs.
- No check digit, to match the PRD's format. Revisit if mistyped IDs become a support issue.

## 005: Two fingerprints per version

`contentHash` is SHA-256 of the exact bytes. `textHash` is SHA-256 of the text after `authoro-text/1` canonicalization (NFKC, invisible characters removed, quotes and dashes folded, whitespace collapsed). HTML is reduced to its visible text first. A reader can then paste text from a published web page and still match the registered version, even after a CMS converts quotes or re-wraps lines. The canonicalization is versioned: changing it means `authoro-text/2`, never editing v1.

## 006: Documents are hashed client-side and not stored

Following the PRD's data-minimization principle, V0 fingerprints files in the browser and stores only hashes and metadata. Optional artifact storage can come later as an opt-in Pro feature.

## 007: Integrity enforced in the database

Postgres triggers make registered versions immutable, make proof status forward-only (`pending_attestation` → `registered` → `withdrawn`), keep attestation claims immutable (only their status changes, and revocation is final), and make author attestations, record events and audit events append-only. Application bugs cannot silently rewrite history.

## 008: One proof record per version, with a pending state

A proof record is created as `pending_attestation` and becomes `registered` only when the author completes the human attestation. This state also serves agent-prepared registrations (MCP, V2): an agent can prepare, and only the human can finalize.

## 009: Typed legal name stored as a salted hash

The attestation step asks for a typed full name, as in the PRD. We store `sha256(salt:normalized-name)` with a private per-record salt, never the name itself. Authoro can later confirm what was typed without keeping it in the clear.

## 010: Sign-in methods and email

**Decided:** 2026-09-30, with the product owner.
Email and password (verified email required, at least 10 characters), plus passwordless magic links (single-use, 10-minute expiry, stored hashed). Accounts created by magic link can add a password in Settings. Email goes through Resend. Without `RESEND_API_KEY`, development prints emails to the console and production refuses to send rather than silently dropping mail. Emails are sent after the response (`after()`), so timing doesn't reveal whether an address has an account. Rate limits for auth endpoints are stored in Postgres so they hold across serverless instances. Passkeys and TOTP MFA come in a later chunk.

## 011: Author profiles and handles

Each account has one author profile in V0: a display name (legal or pen name), a handle, an optional bio and website, and a public-page toggle. Handles are 3 to 40 characters of lowercase letters, digits and single hyphens, with route and brand names reserved. Handles are permanent in V0 because records and author pages link to them. Renames with redirects can come later alongside multiple pen names.

## 012: Audit log hashes IPs

Security-relevant events (account created, session created, password reset or set, profile created or updated) go to the append-only `audit_events` table. Client IPs are stored only as an HMAC keyed by the server secret: events can be correlated, but addresses aren't retained.

## 013: Registration flow

- **Prepare, then attest.** Submitting the wizard creates the work, version 1, the author-supplied evidence and a `pending_attestation` proof record. Only `/attest/[id]`, completed by the authenticated owner, registers it. The API and agent-prepared registrations (MCP) will reuse the same pending state and page.
- **Only fingerprints are sent.** Documents are hashed in the browser, capped at 100 MB because Web Crypto hashes whole files in memory. Streaming hashing can raise the cap later.
- **Author-attached envelopes.** A Proof Envelope attached by the author must describe the same document (its `work.hash` matches the exact or text fingerprint). It is stored as its own attestation with `signature_status` `unsigned` or `unverifiable` (issuer keys arrive in V1) and shown as "Reported by X · submitted by the author · unverified".
- **Duplicates are flagged, not blocked.** If the fingerprint matches a public registered record, the wizard says so and pauses. Authoro records who registered what and when; it doesn't adjudicate authorship.
- **Drafts can be discarded** until attested. Registered records can only be withdrawn, and that is a forward-only status (chunk 6).

## 014: Public records, the mark and verification

- **Checking a copy needs no server.** The proof page ships the version fingerprints, and the reader's browser hashes their copy and compares. Only a count of checks is recorded. The global `/verify` lookup sends hashes, never content.
- **Integrity is recomputed on every view.** The page re-hashes each stored attestation payload with canonical JSON and compares it to the recorded hash, so any tampering (even by someone with database access who bypassed the triggers) shows up as a failed check.
- **Visibility.** Unattested drafts 404 publicly (the owner is sent to attestation). `private` records are owner-only and `unlisted` ones are served with `noindex`. Withdrawn records stay visible with a banner.
- **Canonical IDs.** `/p/au-7k3f92` permanently redirects to `/p/AU-7K3F92`. The mark and all snippets link with `?ref=mark`.
- **The mark image** contains only the validated ID, never user text. It is served with a restrictive CSP, CORS open, and 5-minute caching so impression counts stay meaningful and withdrawals propagate. Styles: `badge` (default) and `icon`; themes: `light` and `dark`.
- **Metrics are aggregate daily counters** per record (`proof_metrics_daily`): mark impressions, mark clicks, record views and copies checked. No cookies, IPs or visitor IDs are stored. Owner views and obvious bots (including headless browsers) aren't counted. The owner sees totals on the record and the dashboard.

## 015: The Authoro Mark (refined placeholder)

Five candidates were compared at 12 to 128px in both themes. The canonical mark is now a **solid disc** with the A knocked out and a check for its crossbar that overshoots the right leg. It keeps a clear silhouette at 12 to 16px, in bylines, in the favicon and in the embeddable badge. The check takes the opposite theme's green so it stays visible on the disc. An **open-ring** variant, whose check escapes the circle, is the expressive large-size form (landing page). The geometry lives in `apps/web/src/lib/mark-geometry.ts`, and a test keeps the static favicon in sync. It is still placeholder art pending a final design.

## 016: Deployment on Vercel

**Decided:** 2026-09-30, with the product owner.
Vercel deploys from GitHub with the root directory `apps/web`. `pnpm vercel-build` applies migrations before building: always for production, and for previews only when `AUTHORO_MIGRATE_PREVIEWS=true`, i.e. when each preview has its own database branch. Without `NEXT_PUBLIC_APP_URL`, the public origin comes from Vercel's system variables (the production domain or the preview's branch URL), and Better Auth trusts every origin a deployment answers on. Previews without a Resend key log emails instead of refusing to send. See `docs/deploy.md`.

## 017: Attestations name the author profile, not the account

Author attestation payloads (`authoro-author-attestation/1.0`) carry `author`, the opaque ID of the author profile (byline or pen name) that attested, rather than the account ID. The payload is published so anyone can recompute its hash. Publishing account IDs would let readers link an account's pen names once multiple pen names exist. The account link stays private in `author_attestations.user_id`.
