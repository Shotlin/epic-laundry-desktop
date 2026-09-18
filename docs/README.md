# Epic BOS — Documentation Set

**An India-first, multi-industry Business Operating System** — ERP + CRM + HR + POS +
compliance + AI in one platform with switchable industry packs. Hybridizing the best of
[AureusERP](https://github.com/aureuserp/aureuserp),
[ERPNext](https://github.com/frappe/erpnext), and
[Odoo](https://github.com/odoo/odoo) — clean-room, docs-first.

> **Canonical rule:** [`02-architecture/00-master-blueprint.md`](02-architecture/00-master-blueprint.md)
> is the single source of truth. Conflicts resolve to it, then to
> [`01-research/04-hybrid-synthesis.md`](01-research/04-hybrid-synthesis.md).

## Reading order (first pass)

1. **Vision** — why: [vision & mission](00-vision/01-vision-mission.md) →
   [India market](00-vision/02-india-market-analysis.md) →
   [competition](00-vision/03-competitive-landscape.md) →
   [the Twelve principles](00-vision/04-product-principles.md)
2. **Research** — evidence: [AureusERP](01-research/01-aureuserp-deep-dive.md) ·
   [ERPNext](01-research/02-erpnext-deep-dive.md) · [Odoo](01-research/03-odoo-deep-dive.md)
    → [hybrid synthesis (steal/reject matrix)](01-research/04-hybrid-synthesis.md) →
    [★ superiority audit (honest vs the 3 repos)](01-research/05-superiority-audit.md)
3. **Architecture** — how: [★ master blueprint](02-architecture/00-master-blueprint.md) →
   [tech stack](02-architecture/01-tech-stack.md) →
   [platform kernel](02-architecture/02-platform-core.md) →
   [tenancy & deployment](02-architecture/03-multi-tenancy-deployment.md) →
   [extensibility](02-architecture/04-extensibility-plugins.md) →
    [security](02-architecture/05-security.md) → [AI layer](02-architecture/06-ai-layer.md) →
    [★ WhatsApp integration master plan](02-architecture/07-whatsapp-integration.md) →
    [★ Automation engine master plan](02-architecture/08-automation-engine.md)
4. **Modules** — what: [catalog (43 modules)](03-modules/00-module-catalog.md) → deep specs:
   [CRM](03-modules/01-crm.md) · [Sales](03-modules/02-sales.md) ·
   [Purchase](03-modules/03-purchase.md) · [Inventory](03-modules/04-inventory.md) ·
   [Manufacturing](03-modules/05-manufacturing.md) · [Accounting](03-modules/06-accounting.md) ·
   [HR & Payroll](03-modules/07-hr-payroll.md) · [Projects](03-modules/08-projects.md) ·
   [POS](03-modules/09-pos.md) · [E-commerce](03-modules/10-ecommerce-website.md) ·
   [Helpdesk & Field Service](03-modules/11-helpdesk-field-service.md) ·
   [Assets & Quality](03-modules/12-assets-quality.md) ·
   [Extended modules](03-modules/13-extended-modules.md)
5. **Industries** — for whom: [pack matrix & mechanism](04-industries/00-industry-matrix.md) →
   [Retail & Distribution](04-industries/01-retail-distribution.md) ·
   [Pharma](04-industries/02-pharma.md) ·
   [Manufacturing & Services](04-industries/03-manufacturing-services.md) ·
   [Wave-2 packs](04-industries/04-wave2-packs.md) · [Wave-3 packs](04-industries/05-wave3-packs.md)
6. **India compliance** — the moat: [doctrine & cockpit](05-india-compliance/00-compliance-overview.md) →
   [GST](05-india-compliance/01-gst.md) · [TDS/TCS](05-india-compliance/02-direct-tax-tds-tcs.md) ·
   [Payroll statutory](05-india-compliance/03-payroll-statutory.md) ·
   [Banking & payments](05-india-compliance/04-banking-payments.md) ·
   [Corporate/regulatory](05-india-compliance/05-corporate-regulatory.md)
7. **Data models** — the bones: [conventions & invariants](06-data-models/00-data-architecture.md) →
   [core entities](06-data-models/01-core-entities.md) →
   [transactional model & ledgers](06-data-models/02-transactional-model.md)
8. **UX** — the feel: [design language](07-ux-design/01-design-language.md) →
   [principles & journeys](07-ux-design/02-ux-principles-journeys.md) →
   [mobile & offline](07-ux-design/03-mobile-offline.md)
9. **Delivery** — the plan: [roadmap & kill criteria](08-delivery/00-roadmap.md) →
   [engineering plan](08-delivery/01-engineering-plan.md) →
   [quality & testing](08-delivery/02-quality-testing.md) →
   [DevOps & SRE](08-delivery/03-devops-sre.md) →
   [GTM & pricing](08-delivery/04-gtm-pricing.md) →
   [risk register](08-delivery/05-risk-register.md)

## The thesis in five lines

1. **ERPNext's platform brain** (metadata engine, immutable documents, verticals-as-apps),
2. **Odoo's UX body** (app grid, kanban-first, offline POS, pivot-everywhere),
3. **AureusERP's modular skeleton** (clean plugin isolation, chatter/fields as kernel),
4. **an India-first compliance heart** none of them fully has (GST/e-invoice/IMS/TDS/payroll
   in-core, never paywalled),
5. **an AI-native nervous system** (drafts everything, posts nothing without a human).

## Status

- Phase: **execution started — Phase 0 kernel scaffold (edition 3, 2026-07-13)**. Added
  superiority audit, WhatsApp + automation master plans, Electron desktop decision (ADR-003),
  `shotlinXchat`/WhatsAPI connector specifics (ADR-004), and ADR-002 (TS Phase-0, Kotlin
  retained as port target). First runnable code is being written.
- Next actions: build & verify Phase-0 kernel (Schema Registry + posting + event bus + audit +
  WA connector to `shotlinXchat`) → Electron desktop shell → seed automations → Phase-1 MVP.

## Maintenance rules

Docs live with code, forever (engineering plan §4). Every behavior change updates its spec
in the same PR. ADRs record irreversible decisions. "Ugly cases" sections grow with every
production bug. A quarterly drift audit keeps this tree true.
