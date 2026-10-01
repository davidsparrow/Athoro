# Authoro API v1

Base URL: `https://authoro.net/api/v1`. All requests and responses are JSON.

| Endpoint                     | Auth    | Purpose                                                                  |
| ---------------------------- | ------- | ------------------------------------------------------------------------ |
| `GET /proofs/{id}`           | none    | A public record, with full evidence payloads, hashes and its provenance  |
| `POST /verify`               | none    | Check hashes against a record, or find records matching hashes           |
| `POST /works`                | API key | Prepare a registration (the author then attests in person)               |
| `POST /works/{id}/versions`  | API key | Prepare the next version of a work                                       |
| `POST /proofs/{id}/evidence` | API key | Add evidence to a registered record (public once the author approves it) |
| `GET /works`                 | API key | List the key owner's registrations                                       |

Looking up and verifying records is free and needs no key. Public endpoints send `Access-Control-Allow-Origin: *`, so any website can call them from the browser. Keyed endpoints are for servers only: never ship an API key to a browser.

## Authentication

Create keys in **Settings → API keys**. A key is shown once. Send it as a bearer token:

```http
Authorization: Bearer au_…
```

Keys can prepare registrations but **cannot complete them**. Every registration made with a key stays `pending_attestation` until the author opens its `attestUrl`, reviews it, and attests while signed in. Likewise, evidence a key adds to a registered record stays off the record until the author approves it. This is deliberate: apps and AI agents may prepare, but only a person can vouch.

## Rate limits

- Public endpoints: 120 requests per minute per IP.
- Keyed endpoints: 30 requests per minute per key.

Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds). Going over the limit returns `429` with a `Retry-After` header.

## Errors

```json
{
  "error": {
    "code": "invalid_request",
    "message": "The registration is invalid.",
    "details": ["work.title: Enter a title."]
  }
}
```

| Status | Code                                            | Meaning                                                                           |
| ------ | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| 400    | `invalid_json`, `invalid_request`, `invalid_id` | Malformed body, failed validation (see `details`), or a bad Authoro ID            |
| 401    | `unauthorized`                                  | Missing, invalid or revoked API key                                               |
| 404    | `not_found`                                     | No public record with that ID, or no work with that ID in the key's account       |
| 409    | `profile_required`                              | The key's account hasn't set up an author profile yet                             |
| 409    | `draft_exists`                                  | The work already has a version waiting for attestation (see `proofId`)            |
| 409    | `unchanged`                                     | The document is identical to an earlier version of the work (see `proofId`)       |
| 409    | `not_registered`                                | Evidence can only be added to a registered record, not a draft or a withdrawn one |
| 409    | `duplicate_evidence`                            | The same evidence is already on the record or waiting (see `evidenceId`)          |
| 409    | `pending_limit`                                 | 10 submissions are already waiting for the author's approval on the record        |
| 409    | `evidence_limit`                                | The version already has 20 additions after registration                           |
| 413    | `payload_too_large`                             | Bodies are limited to 128 KB                                                      |
| 429    | `rate_limited`                                  | Slow down; see `Retry-After`                                                      |

Conflict errors name the record behind them in `error.proofId`, or the evidence in `error.evidenceId`.

## Fingerprints

Documents never go to Authoro; you send their hashes. Hashes are written `sha256:<64 lowercase hex characters>`.

- `contentHash`: SHA-256 of the exact file bytes. For example: `echo "sha256:$(sha256sum essay.html | cut -d' ' -f1)"`.
- `textHash` (optional, text formats): SHA-256 of the text after `authoro-text/1` canonicalization. This lets readers match copies pasted from the web.

The open [`@authoro/core`](../packages/core) package computes both, in Node or the browser:

```ts
import { fingerprintDocument } from "@authoro/core";
const fp = await fingerprintDocument({ bytes, mediaType: "text/html" });
// fp.contentHash, fp.textHash, fp.byteLength, fp.wordCount
```

## `GET /proofs/{id}`

```bash
curl https://authoro.net/api/v1/proofs/AU-7K3F92
```

IDs are case-insensitive. The response is abridged here:

```json
{
  "object": "proof",
  "id": "AU-7K3F92",
  "url": "https://authoro.net/p/AU-7K3F92",
  "status": "registered",
  "visibility": "public",
  "registeredAt": "2026-09-30T16:42:17.000Z",
  "withdrawn": null,
  "work": {
    "id": "AUW-4F8Q2M9C",
    "title": "The Future of Independent Software",
    "type": "essay",
    "canonicalUrl": "https://jane.example/future",
    "description": null
  },
  "author": { "displayName": "Jane Smith", "handle": "jane" },
  "version": {
    "number": 1,
    "contentHash": "sha256:…",
    "textHash": "sha256:…",
    "textCanonicalization": "authoro-text/1",
    "mediaType": "text/html",
    "byteLength": 350,
    "wordCount": 29
  },
  "authorAttestation": {
    "statementVersion": "1.0",
    "signedAt": "…",
    "attestationHash": "sha256:…",
    "payload": { "type": "author-attestation", "…": "…" },
    "intact": true
  },
  "evidence": [
    {
      "class": "self",
      "claimType": "creation-disclosure",
      "submittedBy": "author",
      "status": "active",
      "signatureStatus": "unsigned",
      "addedVia": "registration",
      "createdAt": "…",
      "approvedAt": null,
      "revokedAt": null,
      "revocationNote": null,
      "payload": { "schema": "authoro-creation-disclosure/1.1", "methods": ["ai-assisted"], "…": "…" },
      "payloadHash": "sha256:…",
      "intact": true
    }
  ],
  "versions": [
    {
      "id": "AU-7K3F92",
      "number": 1,
      "status": "registered",
      "registeredAt": "…",
      "url": "…",
      "sources": [
        {
          "evidenceId": "…",
          "claimType": "creation-disclosure",
          "attribution": "Author supplied",
          "supplier": { "type": "author", "name": "Jane Smith" },
          "class": "self",
          "addedVia": "registration",
          "addedAt": "…",
          "approvedAt": null,
          "status": "active",
          "revokedAt": null,
          "links": []
        },
        {
          "evidenceId": "…",
          "claimType": "proof-envelope",
          "attribution": "Reported by Writermark",
          "supplier": { "type": "issuer", "name": "Writermark", "id": "issuer:writermark" },
          "class": "continuous-observed",
          "addedVia": "api",
          "addedAt": "…",
          "approvedAt": "…",
          "status": "active",
          "revokedAt": null,
          "links": [
            {
              "url": "https://writermark.example/reports/7K3F92",
              "host": "writermark.example",
              "label": "Session report",
              "reportHash": "sha256:…"
            }
          ]
        }
      ]
    }
  ],
  "events": [
    { "type": "registered", "at": "…" },
    {
      "type": "evidence-added",
      "at": "…",
      "evidenceId": "…",
      "claimType": "proof-envelope",
      "via": "api"
    },
    { "type": "newer-version-registered", "at": "…", "proofId": "AU-M4X2Q8", "version": 2 }
  ],
  "mark": { "svg": "https://authoro.net/p/AU-7K3F92/mark.svg", "html": "<a href=…" }
}
```

`events` is the record's append-only history: `registered`, `newer-version-registered` (with the newer version's `proofId` and `version`), `evidence-added` (with `evidenceId`, `claimType` and `via`: `author` or `api`), `evidence-revoked` (with `evidenceId`, `claimType` and the author's `note`) and `withdrawn` (with the `reason` code and the author's `note`, or `null`). A record with a newer version stays valid; follow `versions` to find the latest. A withdrawn record has `status: "withdrawn"` and a `withdrawn` object with the time and the reason as shown on the record.

### Evidence and provenance

`evidence` lists every claim about this version, with its full payload. `addedVia` says how it arrived: `registration` (part of what the author attested to), `author` (added by the author later) or `api` (sent with an API key and approved by the author at `approvedAt`). Evidence added later never changes the author's attestation. Evidence the author revoked stays listed with `status: "revoked"`, `revokedAt` and the author's `revocationNote`. Evidence waiting for approval, or declined, is never public.

`versions` is the work's provenance history, oldest first: each public version with the `sources` behind it. A source is attributed to whoever supplied it, as the record page shows it: `"Author supplied"`, or `"Reported by <issuer>"` for a Proof Envelope, whose issuer is named by the envelope itself and unverified until issuer keys arrive. `links` are that source's documentation links, with the `host` readers see. Authoro never fetches or checks linked documentation; `reportHash`, when given, is the SHA-256 the submitter recorded for a downloadable report.

`intact` is recomputed on every request: the stored payload's canonical-JSON ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)) SHA-256 still equals the recorded hash. You can check it yourself with `hashCanonicalJson` from `@authoro/core`.

## `POST /verify`

Check a copy against a specific record:

```bash
curl -X POST https://authoro.net/api/v1/verify \
  -H 'Content-Type: application/json' \
  -d '{ "proofId": "AU-7K3F92", "textHash": "sha256:…" }'
```

```json
{
  "proof": { "id": "AU-7K3F92", "status": "registered", "url": "https://authoro.net/p/AU-7K3F92" },
  "valid": true,
  "match": {
    "matched": true,
    "method": "canonical-text",
    "proofId": "AU-7K3F92",
    "version": 1,
    "sameVersion": true
  }
}
```

- `valid` means the record exists and hasn't been withdrawn.
- `match` is `null` when you send no hashes.
- The `method` is `exact-bytes` (identical file) or `canonical-text` (same words; formatting may differ).
- `sameVersion: false` means the copy matches a different version of the same work.
- An unknown ID returns `{ "proof": null, "valid": false, "match": null }`.

Find records by fingerprint alone:

```bash
curl -X POST https://authoro.net/api/v1/verify -H 'Content-Type: application/json' \
  -d '{ "contentHash": "sha256:…", "textHash": "sha256:…" }'
```

```json
{
  "matches": [
    {
      "proofId": "AU-7K3F92",
      "url": "…",
      "title": "…",
      "author": "Jane Smith",
      "registeredAt": "…",
      "method": "exact-bytes"
    }
  ]
}
```

Several records can match the same document. Authoro lists who registered each one and when; it doesn't decide between them.

## `POST /works`

```bash
curl -X POST https://authoro.net/api/v1/works \
  -H "Authorization: Bearer $AUTHORO_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @registration.json
```

```json
{
  "work": {
    "title": "The Future of Independent Software",
    "workType": "essay",
    "canonicalUrl": "https://jane.example/future",
    "description": ""
  },
  "document": {
    "contentHash": "sha256:…",
    "textHash": "sha256:…",
    "mediaType": "text/html",
    "byteLength": 350,
    "wordCount": 29
  },
  "disclosure": {
    "methods": ["ai-assisted"],
    "aiUses": ["editing"],
    "aiTools": ["Claude"],
    "note": "AI was used for copyediting.",
    "links": [{ "url": "https://jane.example/process/future", "label": "Drafts and notes" }]
  },
  "envelopes": [
    {
      "schema": "authoro-proof/1.1",
      "issuer": { "id": "issuer:writermark", "name": "Writermark" },
      "work": { "hash": "sha256:…" },
      "evidence": { "method": "continuous-composition" },
      "links": [{ "url": "https://writermark.example/reports/7K3F92", "label": "Session report" }]
    }
  ]
}
```

- **`work.workType`:** one of `article`, `essay`, `blog-post`, `newsletter`, `book-chapter`, `book`, `research-paper`, `thesis`, `course-lesson`, `short-story`, `poem`, `script`, `speech`, `documentation`, `code`, `image`, `audio`, `video`, `other`.
- **`disclosure.methods`:** one or more of `manual`, `ai-assisted`, `ai-generated-sections`, `collaborative`, `imported`. `manual` can't be combined with the AI methods.
- **`disclosure.aiUses`:** `brainstorming`, `outlining`, `drafting`, `rewriting`, `editing`, `summarization`, `translation`, `research`, `citations`, `media`. Only allowed alongside an AI method.
- **`disclosure.links` (optional):** up to five links to the author's own documentation of how the work was made (see [Documentation links](#documentation-links)). They're part of the disclosure the author attests to, shown as "Author supplied".
- **`envelopes` (optional):** up to five Proof Envelopes (`authoro-proof/1.0` or `1.1`), each an object or a JSON string. Each `work.hash` must match `contentHash` or `textHash`, and each envelope may be attached once. They're shown as evidence submitted by the author and attributed to the tool or organization each names, marked unverified until issuer signatures arrive. A single `envelope` is still accepted; send one or the other.

### Documentation links

Anyone who submits evidence may link to their own documentation or audit trail: the author in `disclosure.links`, a platform or school in its envelope's `links` (`authoro-proof/1.1`), or the author later through `POST /proofs/{id}/evidence`.

```json
{ "url": "https://writermark.example/reports/7K3F92", "label": "Session report", "reportHash": "sha256:…" }
```

- **`url`:** `https://` only, on a public domain (no IP addresses or `localhost`), with no credentials, spaces or control characters, up to 2,000 characters.
- **`label` (optional):** up to 80 characters.
- **`reportHash` (optional):** the SHA-256 of a report readers can download from the link, e.g. `echo "sha256:$(sha256sum report.pdf | cut -d' ' -f1)"`. The record page lets readers check their copy against it in the browser.
- At most five links per piece of evidence, each URL once.

Links live inside the hashed evidence, so they can't be changed later. Authoro shows each as "Documentation hosted by <host>", attributed to whoever supplied it, and never fetches, stores or checks what's there.

Response `201`:

```json
{
  "object": "registration",
  "proofId": "AU-7K3F92",
  "workId": "AUW-4F8Q2M9C",
  "version": 1,
  "status": "pending_attestation",
  "attestUrl": "https://authoro.net/attest/AU-7K3F92",
  "proofUrl": "https://authoro.net/p/AU-7K3F92",
  "message": "Prepared. The author must open attestUrl, review the details and attest before the record is public."
}
```

Until the author attests, `GET /proofs/{id}` returns `404` and the record appears in their dashboard under _Finish attestation_.

## `POST /works/{id}/versions`

Prepares the next version of one of your works, for example after revising an essay. The new version gets its own Authoro ID and record. Earlier records stay valid; once the author attests, the previous one gains a `newer-version-registered` event.

```bash
curl -X POST https://authoro.net/api/v1/works/AUW-4F8Q2M9C/versions \
  -H "Authorization: Bearer $AUTHORO_API_KEY" \
  -H 'Content-Type: application/json' \
  -d @version.json
```

The body is the same as for `POST /works`, except that `work` is optional:

```json
{
  "work": { "description": "Revised for the print edition." },
  "document": {
    "contentHash": "sha256:…",
    "textHash": "sha256:…",
    "mediaType": "text/html",
    "byteLength": 362,
    "wordCount": 31
  },
  "disclosure": { "methods": ["manual"] }
}
```

- **`work`:** fields you leave out carry over from the latest version. Send `""` to clear `canonicalUrl` or `description`.
- **`work.workType`:** fixed by the work. Leave it out; a different type returns `400`.
- **`document`:** must differ from every earlier version. Identical bytes return `409 unchanged`.
- **One draft at a time:** while a version waits for attestation, another returns `409 draft_exists`. The author finishes or discards the draft first.

Response `201`, with `Location` set to `attestUrl`:

```json
{
  "object": "registration",
  "proofId": "AU-M4X2Q8",
  "workId": "AUW-4F8Q2M9C",
  "version": 2,
  "status": "pending_attestation",
  "attestUrl": "https://authoro.net/attest/AU-M4X2Q8",
  "proofUrl": "https://authoro.net/p/AU-M4X2Q8",
  "message": "Prepared version 2. The author must open attestUrl, review the details and attest before the record is public."
}
```

A conflict names the record in the way:

```json
{
  "error": {
    "code": "draft_exists",
    "message": "Version 2 (AU-M4X2Q8) is waiting for attestation. Finish or discard it first.",
    "proofId": "AU-M4X2Q8"
  }
}
```

Work IDs are case-insensitive. A work that doesn't exist or belongs to another account returns `404`.

## `POST /proofs/{id}/evidence`

Adds evidence to one of your registered records: documentation links, or a Proof Envelope from a writing app, school or publisher that describes this version. For example, a platform can send its audit trail once a course ends.

```bash
curl -X POST https://authoro.net/api/v1/proofs/AU-7K3F92/evidence \
  -H "Authorization: Bearer $AUTHORO_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{ "envelope": { "schema": "authoro-proof/1.1", "issuer": { "id": "issuer:writermark", "name": "Writermark" }, "work": { "hash": "sha256:…" }, "evidence": { "class": "continuous-observed", "method": "continuous-composition" }, "links": [{ "url": "https://writermark.example/reports/7K3F92" }] } }'
```

The body is either `{ "envelope": … }` (an object or a JSON string; its `work.hash` must match the version) or `{ "links": [ … ] }` with one to five [documentation links](#documentation-links).

Response `201`:

```json
{
  "object": "evidence",
  "id": "8f45…",
  "proofId": "AU-7K3F92",
  "status": "pending_approval",
  "reviewUrl": "https://authoro.net/p/AU-7K3F92#review",
  "message": "Submitted. It stays off the public record until the author approves it at reviewUrl."
}
```

- **It waits for the author.** Authoro emails the author, who approves or declines it on the record. Approved evidence appears with its own date, in a section of evidence added after registration, and the record's history gains an `evidence-added` event. The author's attestation doesn't change. Declining is final and leaves no public trace.
- **Registered records only.** A draft or a withdrawn record returns `409 not_registered`.
- **Once each.** The same evidence already on the record or waiting returns `409 duplicate_evidence` with its `evidenceId`. Up to 10 submissions can wait per record (`409 pending_limit`), and a version takes up to 20 additions after registration (`409 evidence_limit`).
- To see whether it was approved, look for its `id` in `GET /proofs/{id}`.

## `GET /works`

```bash
curl https://authoro.net/api/v1/works -H "Authorization: Bearer $AUTHORO_API_KEY"
```

```json
{
  "data": [
    {
      "proofId": "AU-7K3F92",
      "workId": "AUW-4F8Q2M9C",
      "title": "…",
      "type": "essay",
      "version": 1,
      "status": "registered",
      "registeredAt": "…",
      "url": "…"
    }
  ]
}
```

`url` is the public record, or the attestation page while a registration is pending.
