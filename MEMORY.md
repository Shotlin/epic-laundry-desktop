# Epic BOS — Project Memory (continuity)

> Last updated: 2026-07-13. Hand-off note for any future session.

## What this project is
**Epic BOS** — India-first, multi-industry Business Operating System (ERP+CRM+HR+POS+India
compliance+AI), hybridizing AureusERP/ERPNext/Odoo + founder's WhatsApp tool shortlinXchat.
Repos: aureuserp/aureuserp, frappe/erpnext, odoo/odoo, **sayanm085/shotlinXchat**.

## The repos to build FROM (architectural reference — do NOT graft local side-projects)
Per the founder's correction (2026-07-13): the local Desktop folders **Core Protocol** and **lndry website**
(and INERTIA DEBT / momentum null) are the founder's *separate* side-projects (a mobile game, a laundry
booking site, etc.) — they are NOT BOS source and must not be grafted in. The "three repos" to build the
best BOS from are the open-source ERPs named in `docs/`:
- **aureuserp/aureuserp** — modern open ERP (UI/UX + modules reference).
- **frappe/erpnext** — deepest open ERP (doctype engine, modules: Accounting, HR, Manufacturing, CRM,
  Projects, Assets, Buying, Selling, Support, Quality). Use its *module map* as the canonical BOS scope.
- **odoo/odoo** — app-model + vertical-industry approach (Odoo Apps). Use its *app-store* model for the
  marketplace/verticals strategy.
- **sayanm085/shotlinXchat** — the founder's WhatsAPI bridge; the human-facing WhatsApp channel (already
  wired in `server/shotlinXchat/`). This is a genuine differentiator (India SMBs live on WhatsApp).
We implement our OWN TypeScript kernel (ADR-002) inspired by these, not by copying code.

## Current state
  - **Docs: edition 3 complete** — 60 files in `docs/` (master index `docs/README.md`).
- **Execution: Phases P0–P13 BUILT & verified** (all 14 roadmap phases complete) **+ Phase-14 Ops pack + Phase-15 Accounting Dimensions + Phase-16 Inventory depth + Phase-17 Manufacturing depth (MRP) + Phase-18 HR depth**; 243 self-test assertions green across 22 suites (+ `_selftest_env` smoke); `tsc` clean. `docker build` + `docker run` smoke-tested locally (image `epic-bos:local` serves UI + all APIs on :3001; JE submit, cost-center P&L, landed-cost valuation, multi-level BOM/MRP planning, and attendance/leave/expense/loan/recruitment verified in-container).
  - Kernel: metadata-driven entities, generic CRUD, posting engine, audit, event outbox (curl-tested).
  - **GST engine — `npx tsx src/_selftest.ts` → 9/9 PASS** (`server/src/modules/gst/`): CGST/SGST
    vs IGST by place of supply, e-invoice payload, e-way, GSTR-1, cockpit.
  - **CRM / Inventory / POS built** (`server/src/metadata/entities.ts` + posting hooks +
    `public/crm.html`, `inventory.html`, `pos.html`, `invoices.html`, `gst.html`):
    - lead → convert-to-customer; warehouse + stock_entry → stock ledger (running balance);
      POS invoice (Cash/UPI/Card) → GL + stock deduction.
  - **GSP integration layer — `npx tsx src/_selftest2.ts` → 15/15 PASS**: `server/src/integrations/gsp/`
    (SandboxGspConnector deterministic + RestGspConnector for live IRP). e-invoice IRN, e-way bill,
    and IMS 2A/2B accept/reject all run end-to-end. Live = flip `GSP_PROVIDER=rest` + creds.
    - **Phase-1 "books" slice built + `npx tsx src/_selftest3.ts` → 13/13 PASS**: `account` (Chart of
    Accounts, seeded standard Indian accounts), `purchase_invoice` (posts Purchase expense + input
    GST as ASSET + Creditors, and GRN stock-in), and accounting reports `server/src/modules/accounting/reports.ts`
    (Trial Balance / P&L / Balance Sheet derived from GL). UIs: `purchases.html`, `accounting.html`.
    This closes the IMS 2B input-credit loop (purchase → input GST asset → pairs with IMS accept).
  - **Offline POS (store-and-forward) built**: `pos.html` rewritten with an offline queue (localStorage)
    + auto-replay; falls back to queueing when the server/fetch is unreachable, and a `POST /api/sync/push`
    bulk endpoint replays queued docs (create+submit) in order when back online. UI uses inline dark/glassy
    CSS (no external CDN → truly offline-capable). Note: the **lndry website** / **Core Protocol** local
    folders are the founder's separate side-projects and are NOT part of BOS (per founder correction).
  - **HR & Payroll built + `npx tsx src/_selftest6.ts` → 13/13 PASS**: `employee`, `salary_structure`,
    `salary_slip` entities + `server/src/modules/hr/payroll.ts` (earnings, PF/ESI/TDS/PT deductions;
    TDS via simplified slab when `tds_pct` is 0, else pct). `salary_slip_posting` debits `Salary (Expense)`,
    credits `Bank` (net pay) + statutory payables (PF/ESI/TDS/PT). `GET /api/payroll/preview` (live calc)
    + `POST /api/payroll/run` (generate+submit slips for all active employees). UI: `hr.html`.
    This is the Phase-2 differentiator and posts cleanly into the books.
  - **Migration (Tally/Zoho/CSV) built + `npx tsx src/_selftest7.ts` → 8/8 PASS**: `server/src/modules/migration/import.ts`
    generic column-mapping importer + named presets (`tally_ledger`, `zoho_ledger`, `tally_party`, `zoho_item`,
    `generic`). Masters created; documents created **and submitted**; ledger **opening balances** carried into
    the GL via an `Opening Balance (Equity)` leg so the TB reflects history. `GET /api/migration/presets`,
    `POST /api/migration/import`. UI: `migration.html`.     Data-acquisition wedge to win SMBs off incumbents.
  - **Epic AI & Analytics built + `npx tsx src/_selftest8.ts` → 8/8 PASS**: `modules/ai/insights.ts`
    computes live KPIs (sales/purchase, receivables/payables, cash position, net GST payable, net profit,
    assets), **anomaly detection** (negative stock, missing customer GSTIN, large invoices), and top items.
    `modules/ai/assistant.ts` answers NL business questions — uses an LLM when `EPIC_AI_KEY` is set
    (OpenAI-compatible), else deterministic heuristics (always works offline). `GET /api/ai/insights`,
    `POST /api/ai/ask`. UI: `ai.html` (KPI dashboard + chat). This is the Phase-4 differentiator.
  - **Buying & Supply Chain built + `npx tsx src/_selftest9.ts` → 8/8 PASS**: `request_for_quotation`
    (RFQ), `purchase_order` (PO → `purchase_order_posting` computes `grand_total` via GST, commitment-only,
    no GL), `quality_inspection` (QA), `price_list` (PL) entities in `server/src/metadata/entities.ts`.
    UI: `buying.html` (RFQ / PO / QA / Price List tabs + PO grid). Nav card added to `index.html`.
    This closes the procurement loop (RFQ → PO → GRN/purchase_invoice → QA).
  - **Advanced Selling built + `npx tsx src/_selftest10.ts` → 10/10 PASS**: `quotation` (QTN),
    `sales_order` (SO), `delivery_note` (DEL) entities in `server/src/metadata/entities.ts`.
    `quotation_posting`/`sales_order_posting` compute `grand_total` (commitments, no GL);
    `delivery_note_posting` issues stock **out** of the warehouse (no GL — the linked sales invoice
    books revenue). UI: `selling.html`. Nav card in `index.html`. This closes the sales cycle
    (Lead → Quotation → Sales Order → Delivery → Sales Invoice → Payment).
  - **Manufacturing built + `npx tsx src/_selftest11.ts` → 5/5 PASS**: `bom` (BOM-{#####}, finished
    item + raw `bom_item` rows) and `work_order` (WO-{FY}, links BOM + qty + warehouse) entities in
    `entities.ts`. Actual material movement reuses `stock_entry` type `Manufacture`: on submit it
    **produces** the finished goods into the warehouse AND **consumes** the BOM's raw materials from
    the same warehouse (scaled by qty / BOM quantity) — verified stock legs move correctly. UI:
    `manufacturing.html` (BOM / Work Order / Produce tabs). Nav card in `index.html`.
  - **Projects & Services built + `npx tsx src/_selftest12.ts` → 7/7 PASS**: `project` (PRJ) and
    `timesheet` (TS-{FY}) entities in `entities.ts`. `modules/projects/billing.ts#billProject` rolls
    all **unbilled submitted timesheets** for a project into one **draft sales invoice** (line per
    timesheet, ₹ hours×rate, auto GST via the existing sales-invoice posting) and marks them billed;
    re-billing reports "no unbilled timesheets". `POST /api/projects/bill`. UI: `projects.html`
    (Project / Timesheet / Bill tabs). Nav card in `index.html`. Closes the services revenue loop
    (Project → Timesheet → Bill → Sales Invoice → Payment).
  - **Fixed Assets built + `npx tsx src/_selftest13.ts` → 7/7 PASS**: `asset` (AST) register +
    `depreciation_entry` (DEP-{FY}) entities in `entities.ts`. `modules/assets/depreciation.ts`
    computes **Straight Line** `(cost-salvage)/life/12` and **Written Down Value** `book*rate/12`
    (rate = 1-(salvage/cost)^(1/life)), floored at salvage. `depreciation_posting` posts
    `Depreciation Expense` dr + `Accumulated Depreciation (Asset)` cr AND rolls the charge into the
    asset's `accumulated_depreciation`/`book_value` (reverses on cancel). `POST /api/assets/depreciate`
    runs a whole period. UI: `assets.html`. Nav card in `index.html`.
  - **Quality & Compliance built + `npx tsx src/_selftest14.ts` → 5/5 PASS**: `tcs_entry` (TCS-{FY})
    entity in `entities.ts` → `tcs_posting` posts `Debtors (Assets)` dr + `TCS Payable (Liability)` cr.
    `modules/compliance/returns.ts` derives a **statutory summary** straight from the GL: output GST,
    input GST (credit), **net GST payable**, and TDS/PF/ESI/PT/TCS payables, plus `verifyAuditTrail`
    (append-only immutable log fact). Routes `GET /api/compliance/summary` + `/api/compliance/audit`.
    UI: `compliance.html` (Summary / TCS / Audit tabs). Nav card in `index.html`.
  - **Multi-entity / Multi-currency / Branches built + `npx tsx src/_selftest15.ts` → 8/8 PASS**:
    `company` (CO), `branch` (BR), `currency` (CCY) master entities in `entities.ts`; `branch` +
    `currency`/`exchange_rate`/`base_grand_total` fields added to `sales_invoice` & `purchase_invoice`.
    `modules/multi-entity/fx.ts` resolves FX (INR per unit) from the currency master or explicit
    `exchange_rate`; the sales/purchase posting hooks now book the **GL in base INR** (`base_grand_total`
    stored) while keeping the transaction-currency `grand_total`. `GET /api/fx/rate`, `/api/fx/convert`.
    UI: `multi-entity.html` (Companies / Branches / Currencies / FX tabs). Nav card. Multi-entity itself
    is the existing tenant isolation (one tenant = one legal company); companies/branches are the registry
    + reporting dimension.
  - **Platform & Ecosystem built + `npx tsx src/_selftest16.ts` → 11/11 PASS**: `user` (USR) + `app_def`
    (APP, vertical-app marketplace catalog) entities; `modules/rbac/roles.ts#roleCan` enforces a per-role
    permission matrix (admin superuser; cashier can submit not cancel; viewer read-only) — wires into the
    existing per-entity `permissions`. `modules/integrations/payments.ts#paymentLink` returns a **UPI
    intent** (`upi://pay?…`, offline-friendly, WhatsApp-Pay ready) or a **Razorpay** checkout payload
    (paise) when a key is present. `modules/integrations/rpa.ts#runBot` emits an `rpa.*` outbox event for
    external automation workers; `fetchBankStatement` is the bank-API seam. Routes: `/api/auth/whoami`,
    `/api/rbac/check`, `/api/payments/link`, `/api/rpa/run`, `/api/bank/statement`, `/api/marketplace/apps`.
    UI: `ecosystem.html`. Nav card.
  - **Distribution built + `npx tsx src/_selftest17.ts` → 9/9 PASS (ALL PASS)**: read-only **customer
    portal** (`/api/portal/:customer` returns only that party's open invoices + outstanding; rejects
    POST → provably read-only) with `portal.html` (invoice list + UPI/Razorpay pay link); **offline PWA**
    (`manifest.webmanifest` + `sw.js` service worker, registered in `index.html`) so the UI is installable
    and works offline on mobile; **cloud/on-prem Docker** (`Dockerfile` + `docker-compose.yml` + `.dockerignore`
    → `docker compose up -d` serves :3001); **desktop auto-update** wired via `electron-updater` (prod
    `checkForUpdatesAndNotify` + `quitAndInstall`, graceful when no update server). Nav card for portal.
  - **Ops pack (impact features) built + `npx tsx src/_selftest18.ts` → 13/13 PASS (ALL PASS)**: new
    entities `pricing_rule` + `subscription` (`server/src/metadata/entities.ts`); `server/src/modules/ops.ts`
    with (a) **pricing engine** `quoteRate()` — volume/customer discounts + rate overrides, non-invasive
    (UI pre-fills line rates; GL/posting untouched so GST math stays exact); (b) **recurring invoices**
    `runRecurring()` generates + submits sales invoices for every due subscription (catches up missed
    months) and advances `next_date`; (c) **reorder** `reorderSuggestions()` flags items below
    `reorder_level` and `createReorderPO()` drafts one purchase order; (d) **owner alerts** `getAlerts()`
    = overdue receivables (>30d) + low-stock + GST due dates (GSTR-1 11th / GSTR-3B 20th) + renewals due;
    (e) **backup/restore** full-tenant `store.snapshot()`/`replaceAll()` over `GET/POST /api/ops/backup|restore`.
    Routes `/api/ops/quote|recurring/run|reorder|alerts|po/from-reorder|backup|restore`. UI `ops.html`
    (Alerts / Reorder / Subscriptions / Pricing / Backup tabs) + nav card. The three blueprint ERPs
    (AureusERP/ERPNext/Odoo) informed the scope; this pack closes recurring-billing + proactive alerts
    gaps vs them.
  - **Accounting Dimensions built + `npx tsx src/_selftest19.ts` → 11/11 PASS (ALL PASS)**: new entities
    `cost_center` (with parent/group), `journal_entry` (balanced manual double-entry), `budget`
    (`server/src/metadata/entities.ts`). `journal_entry_posting` validates dr=cr and posts GL legs tagged
    with their cost center (account link id resolved to its name, like other postings). `getPnL`/`getBalanceSheet`/
    `getTrialBalance` accept an optional `cost_center` filter (departmental P&L/BS). `getAlerts` now also flags
    **budget breaches** (actual spend by normal-balance on the scoped account/cost center vs `budget_amount`
    at `alert_at_pct`). Reports' default account-type map extended so Salary/Depreciation/statutory payables
    post correctly to P&L/BS even without CoA seeding. `modules/accounting/reports.ts`, `kernel/posting.ts`,
    `modules/ops.ts`. UI `accounting.html` gains Journal Entry / Cost Centers / Budgets tabs + a cost-center
    filter. Closes the "no manual JE / no departmental view / no budget control" gaps vs ERPNext/Odoo.
  - **Inventory depth built + `npx tsx src/_selftest20.ts` → 12/12 PASS (ALL PASS)**: serial & batch

    tracking (`StockLedgerEntry` gains `serial_nos`/`batch_no`; new `item_serial` master records each
    tracked unit; `stock_entry` lines carry `serial_nos`/`batch_no`/`expiry_date`; `stock_entry_posting`
    creates/consumes serials on receipt/issue/transfer). New `stock_reconciliation` document posts the
    +/- delta to reach a physical count. New `landed_cost_voucher` capitalizes freight/insurance/duty into
    item valuation via a zero-qty `valuation_adjustment` on the stock ledger. New `modules/inventory/valuation.ts`
    computes on-hand stock + **FIFO and moving-average** valuation. `getBalanceSheet` now returns an
    `inventory` memo (moving-average + FIFO totals) so valuation is visible without unbalancing the GL
    (periodic inventory model). API: `/api/inventory/valuation|serials|batches|balances`. `inventory.html`
    gains Valuation / Serials / Batches / Reconcile / Landed Cost tabs. Closes the "no serial/batch, no
    stock take, no landed cost, no inventory valuation" gaps vs the 3 blueprint ERPs.
  - **Manufacturing depth (MRP) built + `npx tsx src/_selftest21.ts` → 20/20 PASS (ALL PASS)** (in-process
    HTTP smoke `_smoke17.ts` 6/6; also verified in-container): `workstation` master (name/code/hourly_rate,
    optional cost_center). `bom` gains `operations` (child `bom_operation`: operation + workstation +
    time_in_minutes) and `is_subcontracted`/`subcontractor`; `bom_item` unchanged (an item with its own
    default BOM becomes a **sub-assembly**, so BOMs are multi-level). `work_order` gains `subcontracting` +
    `subcontractor`; `purchase_order` gains `is_subcontracted` + `supplied_items` (raw items to issue to a
    subcontractor). New `modules/manufacturing/mrp.ts`: `explodeBom` recursively flattens a finished good
    into leaf raw requirements + the list of manufactured (sub-assembly) items; `bomCost` rolls up material
    cost (through sub-assemblies) + routing/operation cost (workstation hourly_rate × minutes) for a
    per-unit cost; `planMaterials` turns open Sales Orders into an MRP plan — explodes demand, nets off
    on-hand + open supply (WIP work orders, on-order POs), and emits planned **Work Orders** (one per
    manufactured item, incl. sub-assemblies) and planned **Purchase Orders** (grouped by item default
    supplier). `createPlannedWorkOrders`/`createPlannedPurchaseOrder` draft those documents. Routes:
    `GET /api/manufacturing/bom-cost|explode|mrp`, `POST /api/manufacturing/mrp/work-orders|purchase-order`.
    `manufacturing.html` gains BOM Cost / MRP Plan / Setup (workstations) tabs + subcontracting fields on
    BOM/Work Order forms. `stock_entry_posting` generalized so `Subcontracting Receipt` / `Material Transfer`
    types post correctly. Closes the "no MRP, no routing cost, no subcontracting, single-level BOM" gaps.

## Build roadmap (the "best BOS ever" = 14 phases)
- ✅ P0 Platform kernel (metadata engine, posting, audit, outbox, store, API, desktop shell)
- ✅ P1 GST-perfect billing + books (sales/purchase/pos/inventory/returns/banking/accounting + GSP e-inv/e-way/IMS)
- ✅ P2 People & Data (HR & Payroll w/ TDS, Tally/Zoho migration)
- ✅ P4 Epic AI & Analytics (insights, anomalies, assistant)
- ✅ P3 CRM & WhatsApp engagement (leads→customers, Customer‑360 + support tickets + WhatsApp payment
  reminders via **shotlinXchat**; `support_ticket` entity, `engage.html`. Campaigns/blasts are a thin add‑on.)
- ✅ P5 Buying & Supply Chain (RFQ, Purchase Order, Quality Inspection, Price List)
- ✅ P6 Advanced Selling (Quotation, Sales Order, Delivery Note)
- ✅ P7 Manufacturing & Production (BOM, Work Order, Produce via Stock Entry Manufacture)
- ✅ P8 Projects & Services (Project, Timesheet, bill-to-invoice)
- ✅ P9 Fixed Assets (asset register, SL/WDV depreciation)
- ✅ P10 Quality & Compliance (TCS, TDS/PF/ESI/PT summary, GST net, audit trail)
- ✅ P11 Multi-entity / Multi-currency / Branches
- ✅ P12 Platform & Ecosystem (RBAC, UPI/Razorpay, RPA, marketplace catalog)
- ✅ P13 Distribution (cloud/on-prem Docker, desktop installer + auto-update, offline PWA, customer portal)
- ✅ P14 Ops pack (pricing rules, recurring invoices, reorder, owner alerts, backup/restore)
- ✅ P15 Accounting Dimensions (cost centers, manual journal entry, budgets, dept P&L/BS)
  - ✅ P16 Inventory depth (serial/batch tracking, stock reconciliation, inter-warehouse transfer,
   landed-cost voucher, FIFO / moving-average valuation shown on the Balance Sheet)
  - ✅ P17 Manufacturing depth (MRP) — multi-level BOM/sub-assembly, workstations/operations,
    subcontracting, Material Requirement Planning (planned PO/WO from Sales Orders), BOM costing.
  - ✅ P18 HR depth — attendance, leave management (types, applications, balances), expense claims, employee loans (EMI, schedule), recruitment (job openings, applicants, interviews, pipeline).
  - ⏳ **Forward phases still to build for full parity with the 3 blueprint ERPs (open-ended; ~6 phases):**
   - **P19 CRM/Engagement depth** — campaigns, meetings/calls, opportunity stages, email/SMS gateway,
     notification center.
   - **P20 Service & Quality depth** — SLA, warranty/AMC, maintenance visits, quality procedure + root-cause.
   - **P21 Workflow & Automation** — approval workflows, scheduled jobs (cron for recurring invoices +
     daily alert digest), webhooks, per-user API keys.
   - **P22 Analytics & Reporting** — custom report builder, saved views/filters, spreadsheet export,
     graphical dashboards, consolidated multi-company reports.
   - **P23 Vertical apps & portals** — deeper marketplace apps (Restaurant POS, Clinic, Retail, School),
     vendor self-service portal, simple e-commerce storefront.
   - **P24 Hardening & scale** — Postgres + RLS multi-tenancy, file attachments, full-text search,
     audit retention, 2FA, backup rotation, performance.
Next session: all 14 original roadmap phases + P14 Ops pack + P15 Accounting Dimensions + P16 Inventory
depth + P17 Manufacturing depth (MRP) + P18 HR depth are complete and verified (22/22 self-tests, 243 assertions, `tsc`
clean, Docker image verified). Continue from P19.
Optional deepening — real GSP go-live,
Postgres+RLS tenancy, IMS recon automation, inventory valuation on BS, desktop installer build on a
normal dev machine (electron-builder winCodeSign quirk only blocks this headless box).
  - **Kernel bugfix**: `createRow` was overwriting `data.name` with the series id, so `party`/`item`/`account`/
    `employee` user names were lost (UIs showed series IDs). Fixed to `data: { ...input, name: input.name || name }`
    — documents still get the series as their name; masters keep the human name.
  - **Returns (CDNR) built + `npx tsx src/_selftest4.ts` → 16/16 PASS**: `credit_note` (sales return,
    reverses Sales + output GST, credits Debtors, returns stock in) and `debit_note` (purchase return,
    reverses Purchase + input GST, debits Creditors, returns stock out). GSTR-1 now aggregates a `cdnr`
    section. UI: `returns.html`. Naming CN-/DN-. The GST billing + books cycle is now complete
    (invoice → CN/DN → GSTR-1 B2B + CDNR → TB/P&L/BS all tie).
  - **Banking & Payments built + `npx tsx src/_selftest5.ts` → 15/15 PASS**: `payment_entry`
    (type Receive/Pay) posts to Cash/Bank/UPI/Card and clears **Debtors** (Receive: Bank dr, Debtors cr)
    or **Creditors** (Pay: Creditors dr, Bank cr); full settlement marks the invoice `Paid`. `bank_statement`
    entity + `POST /api/bank/import` (paste JSON lines) and `POST /api/bank/:id/reconcile` (turns a
    deposit/withdrawal line into a payment entry and flags the line reconciled). `GET /api/banking/outstanding`
    returns net receivables/payables (invoice total − payments). UI: `banking.html` (Receive / Pay /
    Reconcile / Outstanding tabs). This is what makes the TB show real cash position.
  - **WhatsApp live-wired (DEFERRED by founder for now)**: shortlinXchat cloned into `shotlinXchat/`,
    running on :3000 (direct mode, QR pending scan). Seed automation present but paused.
- **Desktop = self-contained Electron app (all-in-one for Win/Mac/Linux).** `desktop/main.js` boots
  the Fastify server as a child process (dev: `npx tsx ../server/src/index.ts`; prod: `node
  resources/server/dist/index.js`), waits for `/api/health`, then loads `http://127.0.0.1:3001/ui/`.
  Data persists in OS user-data (`epic.json`), not the asar. Server compiles to JS via
  `server/tsconfig.build.json` (`npm --prefix ../server run build`). Packaged with electron-builder
  (win nsis/portable, mac dmg/zip, linux AppImage/deb/tar.gz). Verified: compiled server boots;
  spawn→health→UI integration proven in isolation. Installer build blocked *only* on this headless
  Windows box by electron-builder's winCodeSign symlink-privilege quirk (env issue, not code) — builds
  fine on a normal dev machine (run as Admin or enable Developer Mode on Windows).
- ADRs: `docs/02-architecture/09-adrs.md` (ADR-002 TS Phase-0, ADR-003 Electron, ADR-004 WA).

## Running processes (this session)
- `shotlinXchat` on :3000 (API key `epic-wa-key`, direct mode, QR pending scan) — WhatsApp deferred.
  - Epic Phase-0/1 server: `cd server && npm start` → :3001 (UI `/ui/`).
  - **Self-test isolation caveat**: `store.ts` defaults to `./data/epic.json` (set via `EPIC_DATA_FILE`).
    Running `npx tsx src/_selftest*.ts` WITHOUT setting `EPIC_DATA_FILE` appends to the shared
    `epic.json` and ACCUMULATES data across runs (causes doubled/dependent assertions). Always run each
    self-test with a fresh `EPIC_DATA_FILE` (e.g. `EPIC_DATA_FILE=/tmp/t.json npx tsx src/_selftest9.ts`)
    so tenants start blank. The completion message is `ALL PASS` for _selftest2..9; `_selftest.ts` prints
    `GST engine self-test complete.` (also exit 0).

## Distribution (founder reaffirmed 2026-07-13)
- **Whole product ships inside Electron** (desktop/, ADR-003) — not a separate web server the user runs.
  The Node/TS/Fastify kernel is spawned as a child process by the Electron main and the window loads
  `http://127.0.0.1:3001/ui/`. Prefer **best-in-class, well-maintained packages** for the desktop shell:
  `electron`, `electron-builder` (installers + auto-update), and (when needed) `electron-updater`,
  `electron-log`, `electron-store` for user-data persistence. Keep the kernel framework-free so it also
  runs as a plain `npm start` server for dev/cloud.

## Repo layout
- `docs/` planning · `server/` Node/TS/Fastify kernel · `desktop/` Electron shell ·
  `shotlinXchat/` (cloned founder WA tool, not part of our repo) · run via READMEs.

## Key decisions (locked)
- Desktop = Electron (ADR-003). WhatsApp = shortlinXchat (ADR-004). Backend Phase-0 = TS/Fastify
  (ADR-002); Kotlin/Spring retained as production port. FOUNDER MAY VETO ADR-002 → install JDK + port.

## Next execution steps
    1. **(founder's call) Build product in TS, not Kotlin/Spring (ADR-002 deferred).** P0–P2 + P4 done:
   platform kernel + GST billing/books + HR/Payroll + Tally/Zoho migration + Epic AI/Analytics + offline
   POS + GSP e-invoice/e-way/IMS + desktop shell. Self-tests: `_selftest.ts`(9) `_selftest2.ts`(15)
   `_selftest3.ts`(13) `_selftest4.ts`(16) `_selftest5.ts`(15) `_selftest6.ts`(13) `_selftest7.ts`(8)
    `_selftest8.ts`(8) `_selftest9.ts`(8) `_selftest10.ts`(10) `_selftest11.ts`(5) `_selftest12.ts`(7)
     `_selftest13.ts`(7) `_selftest14.ts`(5) `_selftest15.ts`(8) `_selftest16.ts`(11) `_selftest17.ts`(9)
     `_selftest18.ts`(13) `_selftest19.ts`(11) `_selftest20.ts`(12) `_selftest21.ts`(20) `_selftest22.ts`(20) = 243 assertions green.
    All 14 original roadmap phases (P0–P13) + the P14 Ops pack + P15 Accounting Dimensions + P16 Inventory
    depth + P17 Manufacturing depth (MRP) + P18 HR depth are DONE and verified.
2. (c) WhatsApp: re-engage later — user scans QR at `shotlinXchat` :3000, then invoice-submit
   automation sends the customer a link + (later) UPI/Razorpay pay button.
3. Real GSP go-live: register GSP/NIC sandbox, set `GSP_PROVIDER=rest` + `GSP_BASE_URL`/
   `GSP_AUTH_TOKEN`/`GSP_ID` in `.env`; no code change needed (connector pattern).
 4. Deepen: IMS recon automation, Postgres+RLS tenancy, then desktop Electron polish/auto-update
    (remaining forward phases P17–P24).

## How to run
- server (standalone): `cd server && npm install && cp .env.example .env && npm start` → :3001 /ui/
- self-test GST: `npx tsx src/_selftest.ts` (9/9) · Phase-1: `npx tsx src/_selftest2.ts` (15/15)
- **desktop (recommended): `cd server && npm install` then `cd desktop && npm install && npm start`**
  — boots the bundled server + opens the app window (all-in-one, no separate server needed).
- package installers: `cd desktop && npm run dist:win|mac|linux` (see desktop/README.md)
- cloud/on-prem (Docker): `docker compose up -d` at repo root → :3001 /ui/ (data in `epic-data` volume)
- shortlinXchat (deferred): `cd shotlinXchat && npm install && npm start` → scan /qr

## Granular memory files (in memory/)
- [epic-bos-desktop-architecture](memory/epic-bos-desktop-architecture.md) — how the Electron app bundles the server + native IPC features
- [epic-bos-crm-module](memory/epic-bos-crm-module.md) — CRM depth: scoring, pipeline, conversion, forecast, crm.html
