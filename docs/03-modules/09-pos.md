# Module Spec: Point of Sale (Retail + Restaurant)

## 1. Job-to-be-done
Bill a customer in under 10 seconds, keep working when internet dies, and give the owner
live sales + cash truth across counters and stores.

## 2. Architecture (the one truly local-first surface)
Flutter app (Android tablet/phone/Windows) with local SQLite: full catalog, prices, tax
rules, customers cached; invoices created offline with provisional numbers; sync engine
(tech-stack §7) reconciles — server assigns statutory series, posts GL/stock. LAN hub mode
for multi-terminal stores (arch 03 §4.3). Hardware: HID/serial barcode scanners, 58/80mm
thermal printers (ESC/POS), cash drawer kick, weighing scale (retail), customer display,
UPI soundbox/QR.

## 3. Entities
`pos_profile` (terminal config: warehouse, series, price list, payment modes, printer),
`pos_session` (open→close with denominations), `pos_invoice` (sync→sales_invoice),
`kot_ticket` (restaurant), `table_layout`, `loyalty_card/points_ledger` (loyalty module).

## 4. Core flows
- **Retail:** scan/search (fuzzy vernacular) → cart (qty×price, item-level discount with
  permission gates) → payment split (cash/UPI/card/credit/points) → receipt (print/WA) —
  under 10s. Returns/exchange by invoice scan; price checker mode.
- **Restaurant:** table map → KOT to kitchen display/printer (course-wise, modifiers,
  cancellations with reason) → running bill → split/merge → settle. Captain app on phone.
- **Session discipline:** opening float → X-report anytime → closing count with variance
  approval (fraud principle) → cash-deposit handoff record.
- **Owner live view:** per-terminal/store sales, voids, discounts, cash position (Epic Owner
  app).

## 5. Feature ladder
- **MVP:** retail billing offline+sync, GST receipts (B2C simplified + B2B with GSTIN
  capture), sessions + cash control, returns, UPI static/dynamic QR, daily summary to WA.
- **v1:** restaurant mode (KOT/tables/modifiers), loyalty + gift cards, exchange flows,
  weighing-scale/label items (fruit/vegetable/jewellery grams), multi-terminal LAN,
  customer-facing display, credit sales (khata) with limits + reminders.
- **v2:** self-order QR menu, kitchen display system, franchise dashboards, dynamic
  pricing/happy hours, e-invoice B2C QR (dynamic QR mandate readiness for large retailers),
  ONDC storefront sync.

## 6. Ugly cases
Internet dead for 3 days (unbounded offline queue + conflict-free series); price changed at
HQ while terminal offline (effective-date price versions); partial return of a multi-payment
invoice; GST rate change at midnight (dual-rate day handling); cashier switch mid-session;
printer jam mid-receipt (reprint idempotency); 10,000-SKU catalog on a ₹8k tablet (indexed
local search perf budget: <100ms).

## 7. India notes
Khata (credit) selling is universal in kirana — POS credit ledger + WA reminders is a killer
feature. B2C invoice aggregation into GSTR-1 handled by compliance module. Composition-scheme
merchants: "bill of supply" mode, no tax collection. Jewellery: HUID/hallmark fields via pack.

## 8. AI assists
Basket-based reorder suggestions, shrinkage anomaly (A9), voice billing ("do Maggi, ek
Amul doodh").

## 9. KPIs
Sales/hour heatmap, avg basket, discount %, void/return %, cash variance, top SKUs,
footfall conversion (with counter integration later).
