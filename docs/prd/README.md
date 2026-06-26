# claudepad - PRDs

The per-phase product requirement documents (PRD-01 through PRD-12) drove the v1 build and have been **removed now that they're implemented** - git history retains every one of them. What remains here:

- [`_context.md`](./_context.md) - the canonical shared facts: product framing, tech stack, design tokens, security model, and the normalized data model. Still authoritative; read it first.
- [`prd-07-backend.md`](./prd-07-backend.md) - the one PRD that is **not** built: the optional store/backend addon, kept as a blueprint for the vNext registry reference implementation.

For the current state of the product, prefer the canonical docs over the (historical) PRDs:

- [`../trustless-model.md`](../trustless-model.md) - the crypto/identity design (the v1 spine), proven by `../../packages/crypto/test/conformance.test.ts`.
- [`../roadmap.md`](../roadmap.md) - phases and what shipped.
- [`../registry-spec.md`](../registry-spec.md) - the open registry contract (the store addon, vNext).
- [`../decisions.md`](../decisions.md) - the full decision log, including the as-built deviations from the original PRDs.

> **Serverless-v1 (2026-06-20):** v1 ships entirely client-side. Sharing = encrypt-to-recipient blobs carried via clipboard/file. The server, hosted URLs, fragment-link mode, and lifecycle features are deferred to a pluggable, open-spec store/registry addon (DECISIONS D-20…D-33, extended by D-74…D-80).
