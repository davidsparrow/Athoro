# Roadmap

V0 proves one loop: **creator registers → Authoro creates a proof → creator embeds the mark → reader verifies.** Each chunk ships as its own pull request.

## V0: public registry loop

- [x] **Chunk 1: Foundation.** Monorepo; `@authoro/core` (IDs, fingerprints, envelope, attestation, verification); full V0 schema with database-enforced immutability; landing page and placeholder mark; CI.
- [x] **Chunk 2: Accounts.** Email and password sign-up with required verification, magic-link sign-in, password reset, Resend mailer (console fallback in dev), database-backed rate limits. Author profile onboarding with a live handle check (pen names welcome), dashboard shell, settings (profile, change or add a password, sign out other sessions), audit logging.
- [ ] **Chunk 3: Registration.** Register a work: metadata, in-browser fingerprinting (file or pasted text), self-attestation disclosure, optional evidence JSON (Proof Envelope). Human attestation step with the typed name. Proof record creation with `AU-` ID and record events.
- [ ] **Chunk 4: Public proof page and mark.** `/p/[id]` with integrity, evidence, disclosure and version sections, written in plain English first with technical details expandable. The Authoro Mark as SVG, HTML embed, text link and WordPress snippet. A verify page for uploading or pasting a document and checking it. Privacy-friendly mark impression and click counts (the V0 north-star metric).
- [ ] **Chunk 5: Public API v1.** API keys; `POST /api/v1/works`, `POST /api/v1/works/{id}/versions`, `GET /api/v1/proofs/{id}`, `POST /api/v1/verify`. Rate limiting and audit logging. API registrations stay pending until the author attests.
- [ ] **Chunk 6: Dashboard and author pages.** My works and versions, register a new version, withdraw a record, `/a/[handle]` public author page.

## Later (from the PRD)

V0.5 Pro accounts, private and unlisted records, Evidence Packs, domain verification · V1 signed envelopes, issuer accounts and keys, multi-provider evidence · V1.25 Identity Verified, organizations · V1.5 WordPress plugin and browser recorder · V1.75 originality scans and Authoro Watch · V2 Authoro MCP and Claude plugin · V2.25 Name Check and research services · V2.5 open Evidence Profile, SDKs, C2PA mapping · V3 publisher and institution network, provenance graph.
