# Tech Stack — Decisions & Tradeoffs

> Expands blueprint §4. Every choice records the honest alternative and why it lost.

---

## 1. Backend: Kotlin (JVM 21) + Spring Boot 3, modular monolith

**Why Kotlin:**
- ERP logic is invariants: typed money (`BigDecimal` wrappers), sealed lifecycle states,
  exhaustive `when` over document states — compile-time safety where Frappe/Odoo rely on
  runtime discipline and tests.
- Coroutines: high-concurrency IO (bank feeds, GSTN/IRP calls, webhooks) without reactive
  spaghetti.
- JVM ecosystem: Flyway, jOOQ/Exposed + Hibernate, Kafka clients, Apache POI (xlsx), PDFBox,
  strong observability. 20-year-proven for financial workloads.
- India hiring reality: large JVM talent pool; Kotlin adoption strong (Android + backend).
- Honors the founding intent (project folder: *epic_crm_shotlin* → "shot of Kotlin").

**Alternatives considered:**
| Option | Why not |
|---|---|
| Python (Frappe path) | Best-in-class for metadata dynamism, weakest for invariant safety at 1M-line scale; we'd re-create ERPNext including its fragility |
| PHP/Laravel (AureusERP path) | Great DX; weaker typing story for a posting engine; Livewire wrong for our clients |
| Node/TypeScript full-stack | Shared types tempting; JVM beats it on long-running compute, threads, decimal math ergonomics |
| Go | Superb ops; anemic ORM/metadata ergonomics for a schema-driven ERP; verbosity tax on domain logic |
| Rust | Correctness ceiling, velocity floor — wrong tradeoff for a docs-to-v1 product |

**Monolith rule:** one Gradle multi-module build; module boundaries enforced by
ArchUnit/Konsist tests (no cross-module imports except via published API interfaces + events).
Extraction to services later is a refactor, not a rewrite.

> **Executable Phase-0 note (ADR-002):** the *runnable* Phase-0 kernel is built in **Node.js +
> TypeScript (Fastify)** in this environment (no JDK installed; the founder's WhatsApp tool is
> also Node). This is the validation/prototype path; the metadata-driven contracts are unchanged,
> and the production port to Kotlin/Spring Boot is mechanical. The planning target stack above
> remains the hardened production target.

## 2. Frontend: React 19 + TypeScript SPA shell

- One shell app (navigation, search, notifications, app grid) + module surfaces.
- **Delivered as a desktop app via Electron** (Windows/macOS/Linux) — see §2.5. The SPA is
  identical whether served from the cloud or loaded inside the Electron shell; the shell just
  removes the browser address bar, adds native menus, auto-update, and local SQLite for
  offline-tolerant caching.
- **Server-driven UI:** Schema Registry emits form/list/kanban view schemas; the client has a
  renderer for each view type (the Odoo/Filament lesson: declarative screens are 10x cheaper).
  Custom screens (POS, reconciliation, planners) are hand-built.
- TanStack Router/Query, Zustand for local state, our design system (`07-ux-design/01`) on
  Radix primitives + Tailwind.
- **Why not Vue** (Frappe UI path): React's Indian talent pool and library depth; no technical
  religion — the design system isolates the choice.

## 2.5 Desktop shell: Electron (Windows / macOS / Linux)

**Decision (ADR-003):** the primary owner/admin/back-office surface is a **desktop application
built on Electron**, wrapping the React SPA from §2. This gives one codebase for Win/Mac/Linux
with native-feeling menus, system tray, auto-update, OS-keychain secrets, and a local cache for
offline-tolerant use — without maintaining three native apps.

- **Why Electron over Tauri:** Electron ships a bundled Chromium + Node, so our existing
  React/TypeScript SPA and Node tooling run unchanged; Tauri (Rust + system WebView) would be
  ~10x smaller binaries and lower RAM, but requires Rust + rewriting the shell and loses the
  Node runtime our WhatsApp/integration tooling expects. **Tauri is recorded as the lean
  follow-up option once the SPA stabilizes and binary size/ram becomes a differentiator.**
- **Why not just a browser tab:** desktop app = auto-update, deep OS integration (tray,
  notifications, file associations for e-invoice JSON/IRN), and a distribution channel that
  doesn't depend on a hosted URL (important for on-prem/self-host SMBs).
- **Security:** context-isolation on, Node integration off in renderer, preload bridge with a
  typed IPC surface, strict CSP, and all backend calls go through the API (never direct DB).

## 3. Mobile: Flutter

- Apps: **Epic POS**, **Epic Field** (sales/delivery/service), **Epic People** (employee
  self-service), **Epic Owner** (dashboards + approvals + compliance cockpit).
- Offline-first: SQLite (Drift) + sync engine (see §7), background sync, conflict rules per
  entity.
- Why Flutter: one codebase, superb low-end-Android performance (the actual Indian device
  fleet), Zepto/Blinkit-grade UI achievable.

## 4. Data layer

| Store | Role | Notes |
|---|---|---|
| **PostgreSQL 16+** | System of record | RLS for tenancy; JSONB for custom fields & metadata; logical replication for read replicas; partitioning for ledger tables |
| **Redis** | Cache, rate limits, queues (Sidekiq-style via Redis Streams initially) | |
| **OpenSearch** | Global search, vernacular analyzers, log/audit search | Indexed via outbox consumers |
| **ClickHouse** (phase 2) | BI on billions of ledger rows | Mirror via CDC (Debezium) |
| **MinIO/S3** | Files, print archives, e-invoice JSONs | WORM bucket for statutory archives |

**Why not MySQL:** RLS, transactional DDL, JSONB indexing, partitioning maturity.
**Custom fields storage:** JSONB column `custom` on every entity table + GIN indexes +
metadata-driven validation — no EAV, no user DDL.

## 5. Eventing

- **Transactional outbox** table written in the same TX as the business change; relay pumps
  to Redis Streams (v1) → Kafka (when scale demands).
- Event catalog versioned (`sales.invoice.submitted.v1`); consumers: webhooks, automations,
  search indexer, AI jobs, integration connectors, analytics mirror.

## 6. AI infrastructure

- **AI Gateway service** (the one separate deployable at v1): provider-agnostic (Anthropic
  first), does OCR/extraction, classification, matching, forecasting, NL→report queries.
- Guardrails: AI may *draft* documents and *suggest* matches; only humans (or explicitly
  enabled auto-rules with thresholds) submit. Full prompt/response audit log per tenant.
- Embeddings + RAG over tenant docs (pgvector first; dedicated store later).

## 7. Sync engine (mobile/POS offline)

- Per-device monotonic change log; pull = server changes since cursor (RLS-filtered),
  push = client mutations with client-generated UUIDs + idempotency keys.
- Conflict policy per entity class: ledger-affecting docs are **create-only offline** (no
  offline edits of submitted docs — immutability makes sync tractable); masters use
  last-writer-wins + conflict surfacing.
- POS invoices created offline get provisional numbers; server assigns statutory series on
  sync (matching Indian invoice-numbering rules; see 05-india-compliance/01-gst.md §7).

## 8. DevEx & quality gates

- Gradle + version catalogs; Testcontainers integration tests; ArchUnit boundary tests;
  OpenAPI generated from code annotations, published SDKs (TS, Kotlin, Python).
- Golden-file tests for every statutory artifact (GSTR JSONs, e-invoice payloads, payslips).
- Seeded demo tenants per industry pack for e2e (Playwright) suites.

## 9. Deployment profiles

| Profile | Shape |
|---|---|
| `solo` (self-host SMB) | Docker Compose: app, Postgres, Redis, MinIO, OpenSearch-optional; runs on a ₹5k/mo VPS |
| `cloud` | K8s: app pool, workers, AI gateway, per-region Postgres (Mumbai/Hyderabad), object storage, observability stack |
| `edge-pos` | Flutter desktop/Android POS with local store-and-forward |
