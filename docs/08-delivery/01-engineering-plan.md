# Engineering Plan

## 1. Team shape (lean by design; scales by module squads)

**Phase 0–1 core (8–10):** 2 kernel (Schema Registry/posting/sync), 2 backend-domain
(accounting+compliance focus — one should have CA-adjacent domain sense or a domain
advisor on retainer), 2 frontend (design system + renderers), 1 Flutter, 1 AI/data,
1 QA-automation, founder/PM. **Statutory advisor (CA firm) on retainer from day one** —
rules-as-data authored with professional sign-off.

**Phase 2+:** module squads (2–3 devs + shared QA/design) per cluster: Money, Supply Chain,
People, Revenue; platform squad owns kernel/infra; compliance squad owns 05-* engines +
fast lane permanently (never disbands — the moat has a crew).

## 2. Repository & code structure (monorepo)

```
epic-bos/
├── kernel/           # schema-registry, lifecycle, posting, authz, collab, jobs, events
├── modules/          # one Gradle module per catalog entry (sales/, accounting/, ...)
├── packs/            # industry packs (metadata + seeds + tests)
├── compliance/       # gst/, tds/, payroll-statutory/ (rule data + engines + goldens)
├── api/              # REST/GraphQL gateway, OpenAPI, SDK generation
├── web/              # React shell + design system + renderers
├── apps/             # flutter/ (pos, field, owner, people; shared core)
├── ai-gateway/       # provider adapters, tools, guardrails
├── infra/            # compose, helm, terraform
└── docs/             # THIS documentation set (lives with code, versioned together)
```

Boundary rules enforced by Konsist tests: modules import kernel-api only; cross-module
calls via published interfaces/events; compliance engines pure (no UI imports); packs
contain zero Kotlin logic beyond registered validators.

## 3. Engineering standards

- Kotlin style: explicit money/qty types (no raw BigDecimal in domain signatures); sealed
  lifecycle states; exhaustive event handling.
- Every entity ships with: metadata file, migration, permission defaults, list/form schema,
  import template, seed/demo data, API tests, at least one golden posting test if it posts.
- PR gates: unit+integration (Testcontainers), invariant suite, ArchUnit/Konsist, OpenAPI
  diff check (breaking-change alarm), perf smoke on hot endpoints, lint+format.
- Definition of Done includes: docs page, help-center stub, analytics events, i18n keys
  extracted, a11y pass on new components, demo-tenant seed updated.
- Trunk-based dev, feature flags per module/pack, release trains per arch 03 §5.

## 4. Documentation discipline (docs-first forever)

This `docs/` tree is canonical (memory + blueprint §10): any architectural change lands as
a docs PR before/with code; module specs updated in the same PR as behavior changes;
ADRs (`docs/02-architecture/adr/NNN-*.md`) for irreversible decisions; quarterly docs-truth
audit (docs vs code drift review).

## 5. Build-vs-buy/integrate register

Integrate (never build): payment processing, WA BSP, GSP filing rails (initially), maps,
OCR base models, DLT SMS, e-sign ASP, biometric hardware SDKs, LMS, full EMR.
Build (never outsource): posting engine, compliance engines + rules data, schema registry,
sync engine, POS core, design system, pricing/scheme engines — anything in the moat list
(vision 03 §3).

## 6. Open-source operating model (from Phase 2)

Public repo: kernel + modules + community packs (license per GTM doc); private: cloud
billing/ops, certain AI orchestration, enterprise consolidation. Contribution ladder:
good-first-issues on packs/translations/report presets; certified-partner program feeds
marketplace (arch 04 §7); community translations with professional review gate
(UX §5 glossary rule).
