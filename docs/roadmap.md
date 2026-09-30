# Roadmap

V0 proves one loop: **creator registers → Authoro creates a proof → creator embeds the mark → reader verifies.** Each chunk ships as its own pull request.

## V0: public registry loop

- [x] **Chunk 1: Foundation.** Monorepo; `@authoro/core` (IDs, fingerprints, envelope, attestation, verification); full V0 schema with database-enforced immutability; landing page and placeholder mark; CI.
- [x] **Chunk 2: Accounts.** Email and password sign-up with required verification, magic-link sign-in, password reset, Resend mailer (console fallback in dev), database-backed rate limits. Author profile onboarding with a live handle check (pen names welcome), dashboard shell, settings (profile, change or add a password, sign out other sessions), audit logging.
- [x] **Chunk 3: Registration.** A four-step wizard: work details; in-browser fingerprinting of a file or pasted text (only hashes are sent); the creation disclosure (manual and AI options exclusive, AI uses and tools, a note) with an optional Proof Envelope checked against the document's hash; and a review with duplicate detection. Submitting creates a pending `AU-` record. `/attest/[id]` shows everything and finalizes with the typed name and statement v1.0, and drafts can be discarded. The dashboard lists works.
- [x] **Chunk 4: Public proof page and mark.** `/p/[id]`, written in plain English first: badges, integrity checks (stored hashes recomputed on every view), an in-browser "Check a copy" widget, evidence cards attributed to their source, versions, and expandable technical details. Withdrawn records stay visible. `/p/[id]/mark.svg` (badge or icon, light or dark) with HTML, WordPress, Markdown and text snippets in an owner-only embed panel. `/verify` looks up an ID (a no-JS form) or a document by fingerprint. Daily counts of mark impressions, mark clicks, record views and checks, with no visitor data (the V0 north-star metric).
- [x] **Chunk 5: Public API v1.** API keys (hashed, shown once, revocable in Settings). Keyless `GET /api/v1/proofs/{id}` and `POST /api/v1/verify` with CORS. Keyed `POST /api/v1/works` (prepares a registration that stays pending until the author attests) and `GET /api/v1/works`. Postgres-backed rate limits, a consistent error format, audit logging, and `docs/api.md`. Attestations now name the author profile rather than the account.
- [x] **Chunk 6: Versions, withdrawal and author pages.** Register a new version from the dashboard or a record: the wizard starts from the latest version with the type locked, catches unchanged documents in the browser, and allows one draft per work. `POST /api/v1/works/{id}/versions` does the same for integrations. Older records show a banner pointing at the newest version, and their history reads in plain English. Owners withdraw a record with a reason, an optional note and a confirmation; it stays public, and its Authoro Mark turns muted and says "withdrawn". `/a/[handle]` lists an author's works with each one's latest version, version count and status.

**V0 is complete.**

## Next (priorities to confirm)

Security hardening (passkeys and TOTP MFA, a PRD requirement) · V0.5 Pro · V1 signed Proof Envelopes · V1.25 Identity Verified · V2 Authoro MCP and Claude plugin.

## Later (from the PRD)

V0.5 Pro accounts, private and unlisted records, Evidence Packs, domain verification · V1 signed envelopes, issuer accounts and keys, multi-provider evidence · V1.25 Identity Verified, organizations · V1.5 WordPress plugin and browser recorder · V1.75 originality scans and Authoro Watch · V2 Authoro MCP and Claude plugin · V2.25 Name Check and research services · V2.5 open Evidence Profile, SDKs, C2PA mapping · V3 publisher and institution network, provenance graph.
