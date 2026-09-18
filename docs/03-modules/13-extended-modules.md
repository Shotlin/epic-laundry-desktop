# Extended Modules (Grouped Specs)

> Medium-depth specs for the remaining catalog entries. Each gets a full spec doc when its
> build wave starts (template in 00-module-catalog.md).

---

## 1. Subscriptions & Recurring Billing (`subscriptions`, tier 2)
Plans (billing cycles, trials, setup fees, usage components), subscription lifecycle
(activate/pause/upgrade with proration/cancel), auto-invoice + auto-collect (UPI Autopay/
e-NACH mandates — the India-specific hard part), dunning for failed mandates, deferred
revenue schedules auto-posted, MRR/churn analytics. Ugly cases: proration + GST on credit
notes; mandate cap (₹15k Autopay tier) forcing hybrid collection; plan migration mid-cycle.

## 2. Marketing (`marketing`, tier 2)
Segments (query builder over parties/orders), campaigns (WhatsApp template/ SMS DLT / email),
journey automation (trigger→wait→branch→send; abandoned cart, win-back, AMC renewal),
consent management (DPDP: opt-in registry per channel), link tracking + attribution to
orders, campaign ROI report. India notes: WA template approval workflow in-product; DLT
template IDs on SMS; TRAI DND scrubbing. AI: segment suggestions, copy drafts (vernacular),
send-time optimization.

## 3. Expenses (`expenses`, tier 1)
Employee claims (photo→AI extraction→policy check→approval→reimburse via payroll or
payment), advances + settlement, mileage claims, per-diem rules, corporate card feed
matching, project/cost-center tagging, GST capture on eligible expenses (hotel B2B bills →
ITC). Ugly: split personal/business, missing-bill declarations, policy caps by grade/city
tier.

## 4. Documents & E-sign (`documents`, tier P)
Org drive (folders by module context: party/project/employee auto-filing), versioning,
OCR + full-text search, retention policies, share links with expiry, templates (letters/
agreements) with merge fields, e-sign: Aadhaar eSign (via licensed ASP) + DSC + simple
click-sign with audit certificate. Every module attaches through this service.

## 5. Approvals (`approvals`, tier 2)
Standalone request types (anything: "laptop purchase", "gate pass") with form builder +
matrix routing + mobile/WA one-tap approve — the gateway drug for going paperless beyond
transactions.

## 6. Planning (`planning`, tier 2)
Shift rosters (HR link: coverage rules, swap requests), resource scheduling for projects/
field-service (capacity heatmaps), leave-aware auto-planning suggestions.

## 7. Knowledge (`knowledge`, tier 2)
SOP wiki (rich pages, review cycles, acknowledgment tracking — "staff ne padha ya nahi"),
policy library feeding AI assistant answers (A10), onboarding reading lists.

## 8. Fleet (`fleet`, tier 2)
Vehicles (docs: RC/insurance/PUC/fitness with expiry alerts), drivers (license expiry),
trip logs (km, fuel — mileage analytics), FASTag/fuel-card feed import, maintenance
schedules, cost per km per vehicle, e-way/trip linkage for own-fleet dispatches.

## 9. Logistics (`logistics`, tier 2)
Carrier connectors (Shiprocket/Delhivery/DTDC/Bluedart), rate shopping, label + manifest
printing, tracking webhooks → customer WA updates, NDR (non-delivery report) workflows,
COD remittance reconciliation, e-way bill data handoff (compliance module executes).

## 10. Budgeting (`budgeting`, tier 2)
Budgets by account × cost-center × month with commitment tracking (PO-time consumption),
warn/block policies, rolling forecasts, variance dashboards, capex vs opex views.

## 11. Portal (`portal`, tier 2)
Customer: invoices/payments/statements, orders + tracking, tickets, price lists (B2B
ordering v2). Vendor: POs, GRN status, bill submission (with extraction), payment status —
kills the "payment kab aayega" call. Employee: covered by Epic People app.

## 12. Analytics (`analytics`, tier P) — expansion
Report builder (columns/filters/groups over any entity, respecting permissions), pivot +
chart views everywhere (Odoo S8), dashboard designer (KPI cards, drill-through), native
spreadsheet (live data functions: =EPIC.GL(), =EPIC.STOCK()), scheduled report delivery
(email/WA), NL query (A4). Phase 2: ClickHouse mirror for big tenants, cohort/RFM libraries.

## 13. Loyalty (`loyalty`, tier 2)
Points earn/burn rules (per item group/price list), tiers, gift cards (liability ledger),
store credit, birthday/anniversary triggers (marketing link), redemption at POS/e-comm.
Ugly: GST treatment of vouchers; points expiry liability reporting.

## 14. Integrations (`integrations`, tier 1) — expansion
Connector catalog UI (arch 04 §6), health dashboard (last sync, error queues, replay),
mapping editors, per-connector logs. Build order: WhatsApp BSP → payment gateways → GSP
(e-invoice/e-way) → banks/AA → Tally bridge → marketplaces → shipping → telephony →
Google/Microsoft.

## 15. AI Assist (`ai-assist`, tier 1) — expansion
The user-facing surface of arch 06: omnipresent assistant (⌘J / mic), review queues
("8 drafts need approval"), AI settings (per-capability toggles, budgets, provider policy),
accuracy feedback loop UI.
