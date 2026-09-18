# Extensibility: Modules, Packs, Customizations, Marketplace

> The upgrade-safety contract is the whole game. Odoo breaks customizations on upgrade;
> Frappe lets them sprawl ungoverned. We do neither.

---

## 1. Four extension tiers (increasing power, increasing governance)

| Tier | Who | Mechanism | Upgrade contract |
|---|---|---|---|
| T1 Config | Any admin | Settings, series, taxes, templates, roles | Never breaks |
| T2 Studio (no-code) | Power user | Custom fields, layouts, views, automations (trigger→condition→action), custom entities, dashboards | Declarative data validated against metadata diffs; conflicts reported pre-upgrade |
| T3 Scripts | Developer/partner | Sandboxed JS (GraalVM) with capability tokens; REST/webhook consumers | Semver'd public event + API catalog; deprecation windows ≥ 2 majors |
| T4 Modules/Packs | Core team + certified partners | Full Kotlin modules / industry packs via manifest | Internal APIs; certified build pipeline |

**Prime directive:** anything a tenant can do (T1–T3) exports as a **Customization Set** —
versioned JSON bundle, diffable, promotable across environments, and inspectable at upgrade
time. Nothing a tenant does edits shipped code or shipped metadata in place.

## 2. Module manifest (T4)

```yaml
module: manufacturing
version: 1.4.0
requires: [core-platform>=1.2, inventory>=1.3, catalog]
provides:
  entities: [bom, work_order, job_card, workstation, production_plan]
  posting_hooks: [work_order -> stock_ledger_entry]
  workflows: [work_order_flow]
  roles: [production_user, production_manager]
  dashboards: [production_overview]
  events: [mfg.work_order.completed.v1]
  settings_panel: manufacturing_settings
```
Kernel resolves the DAG, migrates schemas in dependency order, and can disable a module
(entities become read-only, not dropped).

## 3. Industry Pack anatomy (L4)

A pack is *pure overlay* — it owns no tables it doesn't declare via the same registry:

```yaml
pack: pharma-distribution
enables: [sales, purchase, inventory, accounting, india-compliance, logistics]
seeds:
  item_groups: [Scheduled Drugs H/H1/X, OTC, Surgical]
  masters: {price_lists: [Stockist, Retail], warehouse_zones: [Cold Chain]}
overlays:
  fields:
    - {entity: item, add: [drug_license_class, schedule, narcotic_flag]}
    - {entity: party, add: [drug_license_no, license_expiry, fssai_no]}
  validations:
    - {entity: sales_invoice, rule: "block if customer.license_expiry < today and item.schedule != null"}
  workflows:
    - {entity: purchase_receipt, add_state: QC_HOLD, before: ACCEPTED}
  enforce: {batch_tracking: true, expiry_tracking: true, near_expiry_alert_days: 90}
  prints: [invoice_with_batch_expiry, schedule_register]
  reports: [expiry_ageing, batch_recall_trace]
  dashboards: [pharma_owner_home]
compliance_toggles: [dl_number_on_invoice]
```

Multiple packs coexist (a hospital + pharmacy tenant enables `healthcare` **and**
`pharma-retail`). Disabling a pack removes overlays but archives (never destroys) data.

## 4. Automations (T2 detail)

`WHEN event [sales.invoice.submitted] IF condition [grand_total > 50,000 AND
customer.category = 'New'] THEN actions [require approval L2; notify credit team;
set payment_terms = Advance]`.
- Actions library: set field, create doc, request approval, send template (email/SMS/WA),
  webhook, start activity, call script (T3), enqueue AI task.
- Guardrails: loop detection, per-tenant execution budgets, full run logs with replay.

## 5. Public API & webhooks (T3 surface)

- REST (OpenAPI) auto-generated per entity + curated business endpoints
  (`POST /v1/invoices:submit`, `POST /v1/gst/einvoice:generate`).
- GraphQL read gateway for reporting/portals. Idempotency keys on all writes.
- OAuth2 client-credentials + fine-grained API scopes mirroring RBAC; per-key rate limits.
- Webhooks with signing, retries + DLQ, event catalog versioned (`*.v1`).
- First-party SDKs: TypeScript, Kotlin, Python, plus Postman/Bruno collections.

## 6. Integration connectors (shipped, connector-framework based)

India-critical first: **WhatsApp BSP, Razorpay/PayU/Cashfree, UPI (dynamic QR/collect), Tally
(bridge for CA handoff), GSTN/IRP/e-way (via GSP), Amazon/Flipkart/Meesho marketplace sync,
Shopify/WooCommerce, Shiprocket/Delhivery/DTDC, Google Workspace/Microsoft 365 (mail,
calendar, drive), Slack/Teams, Exotel/Knowlarity (telephony), ONDC (seller app, phase 2)**.
Connector framework: OAuth handshake UI, mapping templates, sync logs, health monitors.

## 7. Marketplace (phase 2)

Certified partner packs/connectors/templates; automated certification (static checks on
capability requests, perf budget, upgrade simulation vs next-release metadata), revenue share,
one-click install with permission consent screen (mobile-app-store mental model).
