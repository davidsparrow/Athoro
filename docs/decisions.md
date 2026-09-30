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
