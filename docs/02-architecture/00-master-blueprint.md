# Epic BOS — Master Blueprint (CANONICAL)

> **This document is the single source of truth.** Module names, stack decisions, layer
> boundaries, and principles defined here override any other doc. Version: 1.0 · 2026-07-13.

---

## 1. Product definition

**Epic BOS** is an India-first, multi-industry **Business Operating System**: one platform that
runs a company end-to-end — CRM, sales, purchasing, inventory, manufacturing, accounting &
statutory compliance, HR & payroll, projects, POS, e-commerce, support, and analytics — with
switchable **Industry Packs** so the same product serves a kirana chain, a pharma distributor,
a garment factory, a hospital, a school, or a construction firm.

**Positioning sentence:** *"Tally's trust + Odoo's breadth + ERPNext's platform + Zoho's polish,
built for Bharat: GST-native, UPI-native, WhatsApp-native, vernacular, offline-tolerant, AI-first."*

## 2. Non-negotiable product principles

1. **India-first, not India-also.** Statutory correctness (GST, e-invoice, e-way, IMS, TDS/TCS,
   PF/ESI/PT) lives in the core, always current, never paywalled.
2. **One platform, many industries.** Verticals are metadata + config overlays (Industry
   Packs), never forks.
3. **Progressive complexity.** A 2-person shop sees an invoice app; a 2,000-person factory sees
   full ERP. Same product, capability-gated.
4. **Immutable business records.** Draft → Submitted (immutable) → Cancelled/Amended; ledgers
   are append-only. Audit-trail is physics, not a feature flag.
5. **Metadata over code.** Entities, views, workflows, permissions, prints, reports are data.
   Customization is governed data, upgrade-safe by contract.
6. **Local-first where the network isn't.** POS, field sales, delivery, attendance work offline
   and sync.
7. **AI-native, human-approved.** AI drafts (entries, matches, forecasts, replies); humans
   approve postings. No silent AI writes to ledgers.
8. **Owner-grade UX.** Every screen passes the "shop owner on a phone" test; accountant depth
   is one tap deeper, never the entry point.
9. **Open core, honest lines.** Community edition is a complete, compliant single-company
   system. Paid = cloud scale, multi-entity consolidation, advanced AI, support.
10. **Clean-room build.** Ideas from references; never their code.

## 3. System layers (the architecture in one diagram)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  L6  CLIENTS: Web shell (SPA) · Desktop (Electron) · Mobile (field/POS, │
│      WhatsApp bot · Public API/SDK · Portal (customer/vendor/employee)   │
├──────────────────────────────────────────────────────────────────────────┤
│  L5  EXPERIENCE: App grid · Global search/⌘K · Dashboards · Report       │
│      builder · Spreadsheet · Studio (no-code) · Notifications inbox      │
├──────────────────────────────────────────────────────────────────────────┤
│  L4  INDUSTRY PACKS: Retail · Distribution · Manufacturing · Services ·  │
│      Healthcare · Education · Construction/RE · Hospitality · Agri ·     │
│      Logistics · Nonprofit  (metadata overlays + seeded config)          │
├──────────────────────────────────────────────────────────────────────────┤
│  L3  BUSINESS MODULES (~40): CRM · Sales · POS · E-commerce · Purchase · │
│      Inventory · Manufacturing · Quality · Assets · Accounting ·         │
│      India Compliance · HR · Payroll · Projects · Helpdesk · Field       │
│      Service · Subscriptions · Marketing · Fleet · Documents · …         │
├──────────────────────────────────────────────────────────────────────────┤
│  L2  PLATFORM KERNEL: Schema Registry (metadata engine) · Document       │
│      Lifecycle & Posting Engine · Workflow Engine · AuthZ (RBAC+row) ·   │
│      Collaboration (chatter/activities) · Customization Layer ·          │
│      Numbering/Sequences · Files · Print/Template Engine · Search ·      │
│      Notification Bus · Scheduler · Import/Export · Audit Log ·          │
│      Event Bus & Webhooks · Extension Sandbox · AI Service Gateway       │
├──────────────────────────────────────────────────────────────────────────┤
│  L1  DATA & INFRA: PostgreSQL (system of record, RLS multi-tenant) ·     │
│      Redis (cache/queues) · Object storage (S3-compatible) · OpenSearch  │
│      (search/analytics index) · ClickHouse (BI at scale, phase 2) ·      │
│      Kubernetes / single-VM compose (self-host)                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 4. Technology stack (decision — details & tradeoffs in 01-tech-stack.md)

| Concern | Decision |
|---|---|
| Backend language | **Kotlin (JVM 21)** — Spring Boot 3.x modular monolith |
| Why | Type-safe at ERP scale, coroutines for IO, mature ecosystem, hire-able in India, honors the project's Kotlin intent ("shotlin"); a metadata engine in a typed language avoids Frappe's runtime fragility |
| API | REST (OpenAPI) + GraphQL for reads + gRPC internal (later) |
| Frontend | **TypeScript + React 19** SPA shell + design system; TanStack Query/Router; server-driven UI schemas from Schema Registry |
| Mobile | **Flutter** (POS/field apps) with SQLite + sync engine |
| Primary DB | **PostgreSQL 16+** (JSONB for metadata/custom fields, RLS for tenancy) |
| Cache/queue | Redis + transactional outbox → event bus |
| Search | OpenSearch (records, documents, vernacular analyzers) |
| Files | S3-compatible (MinIO self-host) |
| AI | Provider-agnostic gateway (Claude/GPT/local), RAG over tenant data, strict tool-permission model |
| Deploy | Docker Compose (self-host SMB) · Kubernetes + Helm (cloud) |

**Architecture style:** *modular monolith* with enforced module boundaries (one deployable,
per-module packages, event-driven seams) — microservices only where physics demands
(AI gateway, search indexer, sync gateway). ERP correctness loves transactions; distributed
transactions are self-harm.

## 5. Kernel service contracts (summaries; full specs in 02-platform-core.md)

- **Schema Registry:** versioned entity metadata (fields, relations, naming, permissions,
  lifecycle, UI hints) → generates migrations, APIs, forms, lists, imports, audit surface.
  Custom fields/entities are tenant-scoped metadata rows, never DDL by users.
- **Document & Posting Engine:** documents implement `Draft→Submit→Cancel/Amend`; submit runs
  validations + posting hooks emitting **GL Entries**, **Stock Ledger Entries**, **Payroll
  Ledger**, etc. (append-only, reversal on cancel).
- **Workflow Engine:** state machines + approval matrices as metadata; SLA timers; per
  industry-pack overrides.
- **AuthZ:** roles → permissions (entity/action/field) + row rules (company, branch, territory,
  cost center) compiled to SQL predicates/RLS.
- **Collaboration:** comments, @mentions, followers, activities/tasks, emails-on-record,
  WhatsApp-on-record; one timeline per record.
- **Customization Layer:** custom fields, custom views, form layouts, automations
  (trigger→condition→action), custom entities, scripts in sandbox; all versioned with
  export/import as "Customization Sets" (deployable between envs).
- **Event Bus:** every commit emits domain events (outbox); webhooks, automations, AI, and
  integrations subscribe. Event catalog is public API.

## 6. Module registry (canonical names — specs in 03-modules/)

**Foundation:** `core-platform`, `org` (companies/branches/fiscal), `parties` (unified
customer/supplier/contact), `catalog` (items/UoM/pricing), `documents`, `collab`.
**Revenue:** `crm`, `sales`, `pos`, `ecommerce`, `subscriptions`, `marketing`, `helpdesk`,
`field-service`.
**Supply chain:** `purchase`, `inventory`, `manufacturing`, `quality`, `assets`, `fleet`,
`logistics` (shipping/e-way integration).
**Money:** `accounting`, `india-compliance` (GST/e-invoice/e-way/IMS/TDS), `banking`
(feeds, reconciliation, UPI), `expenses`, `budgeting`.
**People:** `hr` (employee lifecycle, attendance, leave, shifts), `payroll` (India statutory),
`recruitment`, `appraisals`.
**Work:** `projects`, `timesheets`, `planning`, `approvals`, `knowledge`.
**Platform apps:** `analytics` (reports/dashboards/pivot/spreadsheet), `studio`,
`integrations`, `ai-assist`, `portal`, `website`.

## 7. Industry Pack mechanism (summary; full spec in 04-industries/00-industry-matrix.md)

A pack = manifest + metadata overlays: enabled modules, seeded masters (CoA, item groups, tax
templates), workflow overrides, extra fields/entities, print formats, dashboards, compliance
toggles (e.g. pharma batch/expiry enforcement, FSSAI fields). Packs are additive, coexisting,
and removable. Switching industries = toggling packs, not migrating products.

## 8. Deployment & tenancy (summary; full spec in 03-multi-tenancy-deployment.md)

- **Cloud:** shared Postgres with RLS tenant isolation; per-tenant schema escape hatch for
  large accounts; per-region residency (data stays in India by default — DPDP).
- **Self-host:** single-tenant Docker Compose; identical codebase.
- Tenant = organization; supports multi-company, multi-branch, multi-GSTIN within a tenant.

## 9. Canonical glossary

| Term | Meaning |
|---|---|
| **BOS** | Business Operating System — the whole product |
| **Module** | Installable business capability (L3) |
| **Industry Pack** | Metadata overlay bundle for a vertical (L4) |
| **Document** | Transactional record with lifecycle (Invoice, Order…) |
| **Master** | Reference record (Party, Item, Warehouse…) |
| **Posting** | Immutable ledger projection of a submitted document |
| **Customization Set** | Versioned bundle of tenant customizations |
| **Schema Registry** | Kernel metadata engine defining all entities |

## 10. Document map (how the rest of docs/ hangs off this blueprint)

- `00-vision/` — why we win: market, competitors, principles
- `01-research/` — reference-system evidence behind §2–§5 decisions
- `02-architecture/` — this blueprint expanded per concern
- `03-modules/` — L3 specs, one per module cluster
- `04-industries/` — L4 pack specs
- `05-india-compliance/` — the compliance engines (scope + rules + integrations)
- `06-data-models/` — entities, ERDs, posting schemas
- `07-ux-design/` — design language, offline UX, vernacular
- `08-delivery/` — roadmap, engineering plan, QA, DevOps, GTM, risks
