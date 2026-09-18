# Platform Kernel — Service Specifications

> Expands blueprint §5. The kernel is what makes 40 modules cost 40x less than 40 apps.

---

## 1. Schema Registry (metadata engine)

The Frappe DocType idea, re-done with static-language discipline.

**Entity definition (versioned JSON, stored + shipped):**
```yaml
entity: sales_invoice
extends: document            # document | master | child | ledger
module: sales
naming: series               # series | field | uuid
series_default: "INV-{FY}-{#####}"   # tenant-overridable per company/branch
fields:
  - {name: customer, type: link, target: party, required: true, filters: {is_customer: true}}
  - {name: place_of_supply, type: select, options: state_codes, required: true}
  - {name: items, type: table, child: sales_invoice_item, min_rows: 1}
  - {name: grand_total, type: currency, computed: true, readonly: true}
lifecycle: {submit: true, amend: true, cancel_policy: reversal}
permissions:
  - {role: sales_user, read: true, write: true, submit: false}
  - {role: sales_manager, submit: true, cancel: true}
row_rules: [company, branch]
ui: {list: [name, customer, grand_total, status], search: [name, customer.name, customer.gstin]}
indexes: [[customer, posting_date]]
```

**What one definition buys (generated, never hand-written):**
DB table + migration plan → REST/GraphQL endpoints → validation layer → form/list/kanban
schemas → permission matrix → import/export templates → audit hooks → search mapping →
webhook event types.

**Rules:**
- Shipped definitions are code-reviewed files; **tenant custom fields/entities are DB rows**
  layered at runtime (custom fields live in JSONB `custom`; custom entities get generated
  tables in a tenant namespace).
- Every change is versioned; upgrades diff shipped metadata vs tenant overlays and report
  conflicts *before* applying (the anti-Odoo-upgrade design).
- Field types (v1): text, long_text, markdown, int, float, **currency (paisa-precision
  decimal)**, percent, date, datetime, time, select, multiselect, link, dynamic_link, table,
  check, attach, image, json, phone, email, gstin, pan, hsn, geo, barcode, signature,
  formula, rollup.

## 2. Document Lifecycle & Posting Engine

- Base classes: `Master` (mutable, versioned), `Document` (lifecycle), `ChildRow`,
  `LedgerEntry` (append-only).
- Lifecycle: `DRAFT → SUBMITTED → (CANCELLED | AMENDED)`. Submitted docs immutable except
  whitelisted "post-submit fields" (e.g. delivery status). Amendment creates `INV-001-1`
  linked to original.
- **Posting contract:** modules register `PostingHook(document) → List<LedgerEntry>`:
  - Accounting → `gl_entry` (account, debit, credit, cost_center, party, against_voucher…)
  - Inventory → `stock_ledger_entry` (item, warehouse, qty, valuation, batch/serial)
  - Payroll → `payroll_ledger`, HR → `leave_ledger`, Loyalty → `points_ledger`
- Cancel = posting reversal entries (never deletion). Backdated entries trigger revaluation
  jobs (queued, resumable — the ERPNext repost lesson: design it as a first-class job with
  progress, not a blocking request).
- Period close: closing vouchers + period locks (per module, per company) enforced at posting.

## 3. Workflow & Approvals Engine

- Metadata state machines: states, transitions, `allowed_roles`, conditions (expression
  language over document fields), actions (set field, notify, webhook, create activity).
- Approval matrices: dimension-based (amount bands × department × company) with delegation,
  escalation timers, out-of-office fallback. Approvals surface in inbox, mobile, WhatsApp.
- Industry packs override workflows declaratively (e.g. pharma adds QC-release state to GRN).

## 4. AuthZ

- **Identity:** email/phone + OTP, TOTP 2FA, SSO (Google/Microsoft/SAML/OIDC) for cloud;
  device binding for POS/field.
- **RBAC:** role → permission grants: `(entity, action[read/write/create/submit/cancel/
  amend/export/print], field-level read/write masks)`.
- **Row rules:** compiled predicates on company/branch/warehouse/territory/cost-center/own-
  records; enforced in SQL (and re-checked server-side, defense in depth).
- Roles ship per module with sane defaults (`sales_user`, `accounts_manager`, `auditor`
  read-only-everything…); packs add vertical roles (pharmacist, principal, site-engineer).

## 5. Collaboration Service (chatter)

Every record: timeline (system events + comments), @mentions → notifications, followers,
attachments, **activities** (typed to-dos: call/meet/review with due dates), email-in/out on
record, WhatsApp thread linkage. Stored generically (`ref_entity`, `ref_id`) — zero per-module
work. This is the AureusERP/Odoo lesson elevated to kernel.

## 6. Numbering Service

Statutory-grade series: per company/branch/fiscal-year/document-type; gapless option for
invoice series (row-locked allocation) vs high-throughput non-gapless for internal docs;
format tokens `{FY} {BR} {MM} {#}`; series freeze after first use (audit rule).

## 7. Print & Template Engine

- Templates (HTML/CSS → PDF) with visual designer; per-document-type, per-industry presets:
  GST tax invoice (with IRN/QR zone), bill of supply, e-way slip, delivery challan, payslip,
  cheque, barcode/label (TSPL/ZPL), thermal 58/80mm POS receipts.
- Merge fields from Schema Registry; conditional blocks; vernacular fonts (Noto family);
  digital signature placement.

## 8. Notification Bus

Channels: in-app inbox, push (mobile), email, SMS (DLT-compliant templates), WhatsApp (BSP
API). Rules: event → audience (roles/users/followers) → template → channel preferences +
quiet hours + digests. All templates vernacular-ready.

## 9. Scheduler & Jobs

Cron-as-data (tenant-visible where relevant: "GSTR-1 reminder monthly 8th"). Job framework:
idempotent, resumable, progress-reporting, dead-letter queue, per-tenant fairness caps.

## 10. Import/Export & Migration Studio

- Any entity: xlsx/csv import with column mapping, validation preview, partial-commit report,
  undo window before submit.
- **Migration packs:** Tally (XML/ODBC — masters, ledgers, vouchers), Busy, Marg, Zoho Books,
  ERPNext, Excel templates. Migration is a product surface, not a service engagement —
  Tally-switching friction is our #1 adoption barrier (see 00-vision/02).

## 11. Audit Log

Kernel-level: who/what/when/before-after for every write (masters diffs, doc lifecycle,
permission changes, customization changes, logins, exports, AI actions). Immutable store,
tamper-evident hash chain, retention ≥ 8 years (Companies Act horizon), auditor read-only role.

## 12. Search

Global ⌘K: entities, documents, reports, actions ("create invoice for Sharma Traders"),
help. Per-tenant OpenSearch indexes, permission-trimmed at query time, transliteration +
vernacular analyzers (hi/ta/te/bn/mr/gu/kn/ml/pa/or/as + Hinglish).

## 13. Extension Sandbox (governed scripting)

Where declarative automation isn't enough: sandboxed scripts (JS via GraalVM) with capability
tokens (which entities, which actions, rate limits), versioned + reviewable, dry-run mode,
execution logs. No arbitrary Python-on-server (the Frappe sprawl lesson).

## 14. AI Service Gateway (kernel view)

Kernel exposes: `extract(document_file) → draft_doc`, `match(bank_line, candidates)`,
`classify`, `forecast(series)`, `nl_query(text) → report_spec`, `draft_reply(thread)`.
All calls logged, tenant-scoped, PII-redaction filters, per-tenant model/provider policy,
and kill-switch. Modules consume via typed interfaces — no module talks to a HN model directly.
