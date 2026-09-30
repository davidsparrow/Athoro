# Authoro API v1

Base URL: `https://authoro.net/api/v1`. All requests and responses are JSON.

| Endpoint           | Auth    | Purpose                                                        |
| ------------------ | ------- | -------------------------------------------------------------- |
| `GET /proofs/{id}` | none    | A public record, with full evidence payloads and hashes        |
| `POST /verify`     | none    | Check hashes against a record, or find records matching hashes |
| `POST /works`      | API key | Prepare a registration (the author then attests in person)     |
| `GET /works`       | API key | List the key owner's registrations                             |

Looking up and verifying records is free and needs no key. Public endpoints send `Access-Control-Allow-Origin: *`, so any website can call them from the browser. Keyed endpoints are for servers only: never ship an API key to a browser.

## Authentication

Create keys in **Settings → API keys**. A key is shown once. Send it as a bearer token:

```http
Authorization: Bearer au_…
```

Keys can prepare registrations but **cannot complete them**. Every registration made with a key stays `pending_attestation` until the author opens its `attestUrl`, reviews it, and attests while signed in. This is deliberate: apps and AI agents may prepare a record, but only a person can vouch for it.

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

| Status | Code                                            | Meaning                                                                |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------- |
| 400    | `invalid_json`, `invalid_request`, `invalid_id` | Malformed body, failed validation (see `details`), or a bad Authoro ID |
| 401    | `unauthorized`                                  | Missing, invalid or revoked API key                                    |
| 404    | `not_found`                                     | No public record with that ID                                          |
| 409    | `profile_required`                              | The key's account hasn't set up an author profile yet                  |
| 413    | `payload_too_large`                             | Bodies are limited to 128 KB                                           |
| 429    | `rate_limited`                                  | Slow down; see `Retry-After`                                           |

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
      "payload": { "methods": ["ai-assisted"], "…": "…" },
      "payloadHash": "sha256:…",
      "intact": true
    }
  ],
  "versions": [{ "id": "AU-7K3F92", "number": 1, "status": "registered", "url": "…" }],
  "events": [{ "type": "registered", "at": "…" }],
  "mark": { "svg": "https://authoro.net/p/AU-7K3F92/mark.svg", "html": "<a href=…" }
}
```

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
    "note": "AI was used for copyediting."
  },
  "envelope": {
    "schema": "authoro-proof/1.0",
    "issuer": { "id": "issuer:writermark", "name": "Writermark" },
    "work": { "hash": "sha256:…" },
    "evidence": { "method": "continuous-composition" }
  }
}
```

- **`work.workType`:** one of `article`, `essay`, `blog-post`, `newsletter`, `book-chapter`, `book`, `research-paper`, `thesis`, `course-lesson`, `short-story`, `poem`, `script`, `speech`, `documentation`, `code`, `image`, `audio`, `video`, `other`.
- **`disclosure.methods`:** one or more of `manual`, `ai-assisted`, `ai-generated-sections`, `collaborative`, `imported`. `manual` can't be combined with the AI methods.
- **`disclosure.aiUses`:** `brainstorming`, `outlining`, `drafting`, `rewriting`, `editing`, `summarization`, `translation`, `research`, `citations`, `media`. Only allowed alongside an AI method.
- **`envelope` (optional):** a Proof Envelope as an object or a JSON string. Its `work.hash` must match `contentHash` or `textHash`. It's shown as evidence submitted by the author and attributed to the named tool, marked unverified until issuer signatures arrive.

Response `201`:

```json
{
  "object": "registration",
  "proofId": "AU-7K3F92",
  "workId": "AUW-4F8Q2M9C",
  "status": "pending_attestation",
  "attestUrl": "https://authoro.net/attest/AU-7K3F92",
  "proofUrl": "https://authoro.net/p/AU-7K3F92",
  "message": "Prepared. The author must open attestUrl, review the details and attest before the record is public."
}
```

Until the author attests, `GET /proofs/{id}` returns `404` and the record appears in their dashboard under _Finish attestation_.

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
