# Licensing

Authoro separates the open protocol from the hosted registry:

| Component | License | Why |
| --- | --- | --- |
| `packages/*` (spec, fingerprinting, verification, SDKs) | [Apache-2.0](./packages/core/LICENSE) | The evidence format should spread everywhere. Anyone can produce or verify Authoro-compatible evidence, including in proprietary software. |
| `apps/*` (registry server) | [AGPL-3.0-only](./LICENSE) | Anyone can run, study and improve the registry, but hosted modifications must be shared. |

Unless a package states otherwise, files under `packages/` are Apache-2.0 and all other files are AGPL-3.0-only.

**Network use (AGPL §13).** A deployment of the registry must offer its source to users. Once the repository is public, the site footer will link to it.

**Trademarks.** Neither license grants rights to the Authoro name, the Authoro Mark or "Authoro Verified". Others may implement the protocol, but only the Authoro registry may display official Authoro marks or statuses.
