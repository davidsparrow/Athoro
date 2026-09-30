# @authoro/core

Open reference implementation of the Authoro protocol primitives: identifiers, document fingerprints, the Proof Envelope schema, author attestations and verification. It has no framework dependencies and uses Web Crypto, so it runs unchanged in browsers, Node 20+, edge runtimes and workers.

License: Apache-2.0. The Authoro name and mark are not covered by this license.

```ts
import { fingerprintDocument, fingerprintPastedText, compareFingerprints } from "@authoro/core";

const registered = await fingerprintDocument({ bytes, mediaType: "text/html" });
const pasted = await fingerprintPastedText(textCopiedFromThePublishedPage);
compareFingerprints(registered, pasted); // { matched: true, method: "canonical-text" }
```

## Identifiers

| Kind                           | Format                                 | Example        |
| ------------------------------ | -------------------------------------- | -------------- |
| Proof (one registered version) | `AU-` + 6 Crockford base32 characters  | `AU-7K3F92`    |
| Work                           | `AUW-` + 8 Crockford base32 characters | `AUW-4F8Q2M9C` |

The alphabet is `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I, L, O or U). `parseProofId` accepts lowercase, a missing hyphen, a pasted `…/p/<id>` URL, and corrects O → 0 and I/L → 1. Bodies may grow to 12 characters as the registry does.

## Fingerprints

Hashes are written `sha256:<64 lowercase hex characters>`. A version has:

- **`contentHash`**: SHA-256 of the exact file bytes.
- **`textHash`** (text formats only): SHA-256 of the UTF-8 encoding of the document's text after `authoro-text/1` canonicalization.

### Getting the text

| Media type                                            | Text                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text/html`, `application/xhtml+xml`                  | Visible text: remove comments, doctype and XML declarations, `<head>`, `<script>`, `<style>`, `<template>` and `<noscript>`. Replace block-level tags (`p`, `div`, `li`, `h1`–`h6`, `br`, table cells and so on) with a space and remove other tags. Decode character references per WHATWG. |
| Other `text/*`, `application/json`, `application/xml` | The decoded file, as-is (Markdown is not rendered).                                                                                                                                                                                                                                          |
| Everything else (PDF, DOCX, images, …)                | None. Only `contentHash` is computed.                                                                                                                                                                                                                                                        |

Files must be valid UTF-8 (a BOM is allowed) to receive a `textHash`.

### `authoro-text/1` canonicalization

1. Unicode NFKC normalization (this also folds NBSP to a space and `…` to `...`).
2. Remove U+00AD, U+200B–U+200D, U+2060 and U+FEFF.
3. Replace U+2018, U+2019, U+201A, U+201B and U+2032 with `'`, and U+201C, U+201D, U+201E and U+201F with `"`. (NFKC has already split U+2033, double prime, into two primes.)
4. Replace every run of `-`, U+2010–U+2015 and U+2212 with a single `-`.
5. Replace every run of whitespace, including line breaks, with one space, and trim.

A text match means the words and punctuation are the same and in the same order. It ignores layout and typography, which editors and CMSs change freely. Changes to these rules require a new identifier (`authoro-text/2`).

## Proof Envelope (`authoro-proof/1.0`)

The normalized package evidence providers submit. Only `schema`, `issuer`, `work.hash` and `evidence.method` are required, and providers may add fields to `evidence`:

```json
{
  "schema": "authoro-proof/1.0",
  "issuer": { "id": "issuer:writermark", "name": "Writermark" },
  "work": { "title": "Example Article", "hash": "sha256:…", "mediaType": "text/html" },
  "author": { "displayName": "Jane Smith" },
  "timeline": { "startedAt": "2026-09-27T10:00:00Z", "completedAt": "2026-09-30T08:15:00Z" },
  "evidence": {
    "class": "continuous-observed",
    "method": "continuous-composition",
    "manualCharacters": 12540,
    "pastedCharacters": 922
  },
  "signature": "…"
}
```

Evidence classes: `continuous-observed` (A), `platform-history` (B), `publisher` (C), `identity` (D), `ai` (E), `self` (F, shown as "Author supplied"). Signature verification arrives with issuer keys in V1. Until then, envelopes are displayed as unverified claims attributed to their named issuer.

## Author attestation (`authoro-author-attestation/1.0`)

The final human step of a registration. Its canonical-JSON ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)) hash lets anyone confirm the stored attestation is unaltered. It binds the proof ID, the version's hashes, the account, a hash of the creator's disclosure, a salted hash of the typed name, and the hash of the exact statement text the creator agreed to.
