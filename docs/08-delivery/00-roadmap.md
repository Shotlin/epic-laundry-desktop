# Roadmap — Docs to Dominance

> Phases gate on outcomes, not dates; durations are planning estimates for a focused core
> team (01-engineering-plan.md) and compress with team scale.

---

## Phase 0 — Foundation Proof (~3 months)
**Goal:** kernel de-risked. Build: Schema Registry MVP (entity→table/API/form/list),
document lifecycle + posting engine, AuthZ+RLS tenancy, collaboration service, numbering,
audit log, design-system primitives + view renderers, CI with invariant tests (data-arch §8),
**Event Bus outbox + Automation core (trigger→condition→action)** ([`../02-architecture/08-automation-engine.md`](../02-architecture/08-automation-engine.md)),
and **WhatsApp connector skeleton** (`WhatsAppConnector` interface + `GenericFreeToolConnector`
for the founder's free WA tool + webhook receiver + attach-to-timeline)
([`../02-architecture/07-whatsapp-integration.md`](../02-architecture/07-whatsapp-integration.md)).
**Exit test:** define `party`+`item`+`sales_invoice` in metadata; get working CRUD+submit+
GL posting+API+audit with **zero** entity-specific UI code; cross-tenant leak suite green;
an event fires a seed automation; a WA message from the free tool lands on a Party timeline.

## Phase 1 — MVP: "GST-perfect billing + books" (~4 months)
Modules: org/parties/catalog, sales (invoice/CN/receivables), purchase (bills/payables),
inventory (basic), accounting (GL/vouchers/bank import/TB/P&L/BS), **india-compliance v1**
(tax engine, e-invoice, e-way, GSTR-1/3B projections, 2B recon v1), POS retail (offline),
AI A1/A2 v1, migration: Tally masters+openings, web app + Epic Owner app beta.
**Exit:** 50 design-partner tenants (retail/distribution/services mix) run their real
business ≥1 full GST cycle; NPS>40; filing artifacts accepted by their CAs.

## Phase 2 — v1 GA: "the complete SMB BOS" (~5 months)
Adds: CRM, HR+payroll (statutory full), expenses, projects+timesheets, helpdesk, assets,
banking (feeds/recon workbench/payouts), budgets, analytics (report builder+dashboards),
studio (custom fields/automations/prints), portals, WhatsApp surface (per [`07-whatsapp-integration.md`](../02-architecture/07-whatsapp-integration.md)),
automation Flows + approval gates (per [`08-automation-engine.md`](../02-architecture/08-automation-engine.md)),
Epic Field + People
apps, packs: retail-general, distribution-fmcg, pharma (both), services-professional.
**Exit:** 1,000 paying tenants; support load <X tickets/tenant/mo; upgrade path proven
(3 releases with zero customization breakage).

## Phase 3 — v1.5: depth + verticals (~6 months)
Manufacturing (discrete) + quality, field-service, subscriptions, marketing, e-commerce
storefront + marketplace sync, loyalty, wave-2 packs (restaurant, construction, healthcare,
education, logistics), CA partner console GA, AI v2 (A3/A5/A6, 6 languages voice),
marketplace beta (certified partners).
**Exit:** 3 verticals with ≥100 reference tenants each; CA channel ≥30% of new revenue.

## Phase 4 — v2: scale & moat (~ongoing)
Multi-company consolidation, ClickHouse analytics, ONDC, import/export depth, wave-3 packs,
process manufacturing, AI autopilot rules, marketplace GA, mid-market features (SSO/SCIM,
advanced approvals), own-GSP evaluation, international-readiness spike (GCC VAT?) — only
after India depth undeniable (anti-goal guard, vision 03 §4).

## Cross-phase tracks (never pause)
Statutory currency (fast lane, arch 03 §5) · performance budgets (UX §1.4) · security
(pen-tests per release, certs per arch 05 §3) · docs+help content (vernacular) · community
(open-core repo hygiene, contributor program from Phase 2).

## Kill/pivot criteria (honesty clauses)
Phase 1 partners won't run real GST cycles on it → the wedge is wrong, stop and re-scope
before GA. CA channel rejects console in Phase 3 → rethink distribution before scaling
spend. AI extraction accuracy plateaus below usefulness → keep human-first flows primary,
demote AI marketing (never ship trust-burning automation).
