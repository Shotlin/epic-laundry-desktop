# Hybrid Synthesis: What Epic BOS Takes From Each Reference

> The decision record that turns three deep-dives into one design. When a later doc conflicts
> with this file, `02-architecture/00-master-blueprint.md` wins, then this file.

---

## 1. The synthesis thesis

Each reference system is the best in the world at exactly one layer, and mediocre at the others:

| Layer | Winner | Why |
|---|---|---|
| Platform theory (metadata, immutability, verticals-as-apps) | **ERPNext/Frappe** | DocType engine, Draft→Submit→Cancel, ecosystem apps |
| UX, breadth, commercial playbook | **Odoo** | App grid, kanban pipelines, offline POS, pivot-everywhere |
| Modern modular codebase ergonomics | **AureusERP** | Clean plugin isolation, chatter/fields as kernel, MIT posture |
| India statutory depth | **ERPNext (+India Compliance app)** | Only credible open reference; still beatable on UX |

**Epic BOS = ERPNext's platform brain + Odoo's UX body + AureusERP's modular skeleton +
an India-first compliance heart none of them fully has.**

## 2. The steal-this matrix (canonical adoption decisions)

| # | Capability | From | Epic BOS adoption |
|---|---|---|---|
| S1 | Metadata-driven schema (DocType) | ERPNext | **Schema Registry**: every entity defined as versioned JSON metadata → auto DB, API, UI, permissions, audit |
| S2 | Draft→Submit→Cancel immutability | ERPNext | Core document lifecycle; submitted = immutable; amendments linked |
| S3 | Append-only ledger projections (GL/Stock) | ERPNext | Posting engine emits immutable ledger entries on submit |
| S4 | Verticals as apps on one platform | ERPNext + Odoo industries | **Industry Packs**: config + metadata overlays, switchable per company |
| S5 | App grid & progressive activation | Odoo | Capability catalog; install/uninstall packs without downtime |
| S6 | Chatter/activities/followers on every record | Odoo + AureusERP | Kernel **Collaboration Service** (comments, mentions, activities, followers, audit feed) |
| S7 | Runtime custom fields | AureusERP Fields + Frappe Custom Field | Governed **Customization Layer** (fields, views, automations) — upgrade-safe, versioned, reviewable |
| S8 | Kanban/calendar/pivot/graph views on any entity | Odoo | View types are metadata; analytics is a view, not a product |
| S9 | Offline-first POS | Odoo | Local-first POS client with sync queue (see 03-modules/09-pos.md) |
| S10 | Bank reconciliation UX | Odoo | Suggestion-driven matching + Indian bank feeds/UPI |
| S11 | Stock routes & rules (MTO, dropship, cross-dock) | Odoo | Rule-based fulfillment engine in Inventory |
| S12 | Workflow engine as data | Frappe | State machines defined in metadata, per-industry overridable |
| S13 | Report builder + query studio | Frappe Insights + Odoo pivot | Embedded BI: report builder, pivots, dashboards, native spreadsheet |
| S14 | Print format designer | Frappe | Template studio (invoice/label/voucher), GST-compliant presets |
| S15 | Setup wizards + country pack | ERPNext | 15-minute onboarding: GSTIN-driven auto-setup (fetch legal name, address, state) |
| S16 | Plugin dependency graph + isolated packages | AureusERP | Module manifest with semver deps; kernel loads a DAG |
| S17 | In-product no-code studio | Odoo Studio (concept) | **Ships in core, not paywalled** — forms/flows/automation editor |
| S18 | Compliance as data-first scope | India Compliance app | Rebuilt natively: GST/e-invoice/e-way/IMS/TDS engines in core (see 05-india-compliance/) |

## 3. The reject list (anti-decisions, equally binding)

| # | Rejected pattern | Seen in | Reason |
|---|---|---|---|
| R1 | Site-per-tenant ops | Frappe | Ops burden; we use shared-schema row-level tenancy with tenant escape hatch (see 02-architecture/03) |
| R2 | Compliance behind paywall | Odoo Enterprise | Statutory correctness is a right, not an upsell; our paid tier sells scale/AI/support |
| R3 | XML view-inheritance customization | Odoo | Upgrade-hostile; customizations must be declarative data with compatibility contracts |
| R4 | Two-generation UI split | ERPNext (Desk vs Vue apps) | One design system, one shell, all modules |
| R5 | Ungoverned script injection | Frappe client/server scripts | Extensions run in governed sandbox with review + version pinning |
| R6 | Server-round-trip UI for high-frequency screens | AureusERP/Livewire | POS, barcode, field apps are local-first clients |
| R7 | Enum-only status without workflow metadata | AureusERP | Industries must be able to redefine flows without code |
| R8 | Copying code from GPL/LGPL repos | ERPNext/Odoo | License contamination; we adopt **ideas and specs only**, clean-room implementation |

## 4. Feature-coverage union (completeness target)

Epic BOS v1 functional surface = union of: ERPNext core + Frappe HR + India Compliance scope,
Odoo community app grid, AureusERP plugin set — normalized into ~40 modules (see
`03-modules/00-module-catalog.md`) and 10+ industry packs (see `04-industries/`).

## 5. Differentiators beyond the union (net-new, none of the three have)

1. **GSTIN-first onboarding** — type one GSTIN, get a configured company.
2. **Owner-grade compliance cockpit** — GST/TDS/PF health as a single traffic-light dashboard,
   not accountant-only screens; IMS actions in plain language.
3. **Vernacular + voice UX** — 12 Indian languages, voice-driven invoice/expense entry.
4. **WhatsApp as a first-class channel** — invoices, payment links, approvals, catalogs, CRM
   conversations (India's real business messaging layer).
5. **AI-native core** (not bolt-on): document extraction (bills→entries), reconciliation
   suggestions, cash-flow forecasting, anomaly alerts, natural-language reporting.
6. **Offline-first mobile field suite** — sales rep / delivery / field service apps that work
   in no-network markets and mandis.
7. **UPI-native receivables** — every invoice carries a dynamic UPI QR; auto-reconciled.
8. **Industry switching in-product** — enable "Pharma Distribution" pack and masters,
   workflows, prints, and compliance shift accordingly; multiple packs can coexist.

## 6. License strategy consequence

References are MIT (AureusERP), GPL-3 (ERPNext), LGPL-3 (Odoo). Epic BOS is a clean-room
build: we reuse **concepts, schemas-as-specs, and UX patterns** (not copyrightable expression),
never source code. This keeps our licensing free to choose (recommendation in
`08-delivery/04-gtm-pricing.md`: open-core with AGPL core + commercial cloud, compliance in core).
