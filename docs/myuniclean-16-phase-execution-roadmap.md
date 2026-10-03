# Epic Laundry × MyUniClean — 16-phase execution roadmap

## Product direction

Keep Epic Laundry's current brand colours, mark, and overall page layout. Carry over the small interaction details that make MyUniClean familiar to staff: clear dropdowns, visible selections, compact labels, helpful icons, predictable filters, and direct dashboard shortcuts. Keep Epic's additional finance, production, marketplace, and operations features; make them easy to find and understand instead of removing them.

Treat MyUniClean as a read-only workflow reference. For each phase, audit the matching source controls, compare Epic's current page, fix the highest-impact gaps, verify the result in an isolated Epic demo, and update the parity matrix. Do not advance a phase until its acceptance checks pass or its remaining gaps are clearly recorded.

The phase list is a plan, not a claim that every screen is complete. Existing implementations are reused and checked; work is added only for verified gaps.

## Additional requirements from the product workbook

These are requirements supplied by the user in `Lndry Tech and Product .xlsx`, `Sheet1` rows 2–7; they are not observations about MyUniClean. The Status and platform columns are blank for all six rows, so their implementation and acceptance status still needs to be verified against Epic.

| Requirement | Planned phase | Acceptance check |
|---|---:|---|
| Customer autocomplete while creating an order; select a match or open a new-customer form with phone and admin-configurable fields | 5, 8, 9 | Exact/partial match can be selected; no match offers a reversible customer draft; configured fields appear and persist under the intended admin setting. |
| Search and add garments with type, count, and colour details | 6, 9 | Staff can find or add an allowed garment/service, enter item details and quantities, and see each line in the order draft and quote. |
| Edit garment prices; make tax, discount, and payment choices easy to find | 6, 9 | Authorized price changes save through catalogue settings; booking selectors are visible and the selected values appear in the draft before commit. GST stays at Epic's 18% default. |
| Add garment type, price, and service from beside the garment search | 6, 9 | The order screen offers a clearly labelled add flow; it validates required catalogue fields, requires an explicit save, and makes the new item selectable without losing the current order draft. |
| Dashboard order/booking/pending links open detailed lists with customer and order information | 3, 10 | Each shortcut opens the correct filter and exposes the matching operational rows and readable customer/order details. |
| Order search opens one full order page; edits reuse the order-creation flow | 10 | The detail page contains the complete order record; Edit opens the shared booking form in edit mode, with a clear save/cancel boundary and an auditable result. |

Payment-link creation from booking will be audited in Phase 9, with settlement/reconciliation boundaries audited in Phase 13. Sending or collecting payment is treated as an external/financial action and must never happen from a selector change alone.

## User clarification: GST interaction

This is a product requirement from the user, not a claim about tax law or a new calculation model:

- Keep Epic Laundry's GST rate/default at 18%.
- Clicking the GST control must open a clear dropdown. When staff choose a supported option, show the chosen label/value in the order draft immediately, without an extra hidden step.
- A fresh read-only source check verified that the TAX summary dropdown offers `None` and `GST (18%)`. A separate source combo labelled `Tax` offers `Including GST` and `Without GST`. No source option was selected or order booked, so the mode's calculation effect and persisted result remain unresolved. Match the actual rate selector and keep any mode selector distinct.
- Verify Epic's exact choices against its current configuration before implementation. Do not treat `Including GST` / `Without GST` as tax rates.
- Do not change or reverse-engineer the GST calculation, or invent another rate. Keep Epic's existing quote calculation authoritative and verify the selected dropdown value is reflected in its existing quote.

## Phase execution loop

Each phase follows the same sequence:

1. Read the relevant source page and record its route, navigation location, dashboard links, role boundary, default state, loading/empty/populated/error states, control labels/options, and safe action boundary.
2. For each meaningful control, map its trigger, enablement, data read, validation, confirmation, server action, changed record, visible result, history/audit impact, reversibility, required role, and failure behavior. Do not infer unobserved behavior from labels or code alone.
3. Open the matching Epic route and inspect its UI, API/domain behavior, permissions, data persistence, and related modules before listing a gap.
4. Classify each difference as a required fix, acceptable Epic difference, Epic enhancement, unresolved, or inaccessible/unverified. Check shared customer/order/status/financial values across the modules they affect.
5. Implement only the approved parity gaps, keeping Epic's colour system and page structure.
6. Run the relevant build, API/domain checks, and focused browser tests in an isolated demo. Manually open the changed route and inspect desktop/narrow layouts, keyboard access, and supported themes.
7. Update the route/control maps, audit ledger, master parity matrix, and known-gap register with evidence and remaining uncertainty.
8. Mark a phase Complete only when its acceptance checks pass; otherwise report Partial, Blocked, or Requires Further Verification. Code presence or a passing narrow test is not proof of whole-page completion.

### Required per-page evidence fields

For each Epic page, record the route and menu group, linked dashboard shortcuts, related pages, permission boundary, default and data states, desktop/narrow layout, and supported themes. For each major field, record its source, displayed/editable/persisted value, default and null behavior, validation, affected record/module, and whether downstream modules reflect the change. These maps are the evidence behind phase decisions, not a claim that the existing implementation is already verified.

Live MyUniClean remains read-only. Test writes use disposable local data. Booking, imports, status changes, settings saves, outbound messages, and other writes are verified through local fixtures or stopped before the live commit control.

## Phases

### 1. Audit inventory and baseline

**Scope:** Every source navigation destination, report submenu, Settings page, dashboard card, header control, filter, dropdown, table action, modal, empty state, and visible error state. Inventory every major Epic route too, including Epic-only finance, production, marketplace, operations, and administration. Include the controls already listed in the supplied Uniclean audit document, the technical/product workbook requirements, and the complete page/control/data/interaction evidence fields in the master product goal.

**Deliver:** Route-to-function map; control-by-control ledger; field/data and cross-module map; representative visual evidence; role and write-boundary map; evidence tags of Verified, Partially Verified, Guarded, Not Audited, Access Restricted, or Source Behavior Unresolved; ordered list of remaining Epic gaps.

**Pass when:** Every route has an explicit status and every critical control has its observed trigger/result/write boundary mapped or is explicitly marked inaccessible/unverified. Source behavior is separated from product requirements and instructions in supplied documents. Loading, empty, populated, error, denied, responsive, and theme states are either covered or recorded as remaining work.

**Current state:** The route inventory is present. Live isolated-demo and read-only source sweeps expanded Epic's navigation groups, checked the source Dashboard-to-Collection Report path, GST selectors, global search controls, desktop menu toggle, report hierarchy, and source Settings/message-template hierarchy. The automated route smoke suite passed all four tests: 32 major routes rendered at six desktop widths, passed 390 px overflow checks in light/dark appearance, and had accessible button names across 45 route targets. The isolated role-access test passed for owner, counter and processing cases, including selected route denials. It exposed that counter staff could see the Finance link but could not open the owner-guarded page; the link now requires `settings.manage`, and the owner/counter regression passes. This does not cover every route permission. A fresh isolated-demo template check verified placeholder insertion updating the unsaved sample preview and Cancel discarding the draft. The 1 October dashboard follow-up clicked the major order queues, Collection Amount, New Order, Search Customer, a recent-order row and the guarded WhatsApp review step; it recorded safe result states and two confirmed parity gaps. Focused E2E checks click all seven Operations hub workstream cards and all 34 current sidebar placements (34 unique destinations), asserting route and visible page identity; a Phase 15 review removed the duplicate Captain settlements placement. The three disconnected Platform pages now have route-specific headings/descriptions, a working Platform Control link, and desktop/390 px screenshots. Settings clickthrough covers 13 directory-link placements, three in-page shortcuts, and five workspace tabs at desktop/390 px; it found and fixed a 390 px profile-grid overflow. The Settings directory now sends `Garment pricing` to the price matrix and `Garments` to the garment library through distinct deep links with focused, announced context. Eleven focused Settings specs cover 15 test cases, all passing across the grouped run and targeted retry. The Overview's four independent date filters, custom-range cancel/apply, and 390 px states are tested with synthetic responses. Store Expense search/date filters, clear behavior, exports, list/grid and counter-versus-processing access are tested; the permission model still binds list GET to `expenses.create`. Collection Report tests now cover table dates, payment method, independent chart ranges and custom chart safety; the shared report date control blocks inverted ranges. A focused 19-case E2E group covering report recovery/contracts, expense controls and role access passed after the production build; server laundry self-tests passed as well. Finance normalization/backfill and data-safety writes remain guarded. These checks verify destination and selected page states, not every control's business behavior, all data/error states, or all route permissions. Phase 1 is Partial. The supplied master brief contains 1,270 lines and Sections 1–29, including the Phase 16 launch-readiness gate; this 16-phase roadmap translates that full brief into sequenced work.

Phase 1 worklog: [PHASE_01_WORKLOG.md](parity/PHASE_01_WORKLOG.md). On 1 October the 32-route responsive/theme suite passed 4/4, the expanded counter/processing catalogue access regression passed 1/1, and the sidebar navigation suite passed 1/1 after a fresh production build. The current browser automation transport returned Transport closed, so this slice did not add live MyUniClean clicks. The latest work-card role check passes for counter and processing: processing can read order history but has no edit, cancel, progress, collection or reversal controls; a direct edit PATCH is rejected and the edit route is denied. The six Store Orders regressions pass after the permission change. The customer workspace continuation makes the previously unreachable `/laundry/customers/:id` profile route render the work card, adds a labeled link from the Store Orders drawer, and verifies owner/counter/processing permissions, profile/address edit boundaries, isolated wallet/reward entries, order-balance separation, and 390 px layout; customer E2E passes 2/2 with server customer self-test, typecheck, and web build passing. These are local isolated-demo checks; live source field comparison and connected-web persistence remain open. The full control and state baseline remains incomplete.

### 2. Brand-safe shell and navigation

**Scope:** Epic logo and colours, utility header, menu toggle, persistent desktop navigation, responsive drawer, selected destination, global search, notifications, theme, support, logout boundary, refresh, and settings shortcut.

**Deliver:** Consistent route shell with readable labels, familiar small icons, keyboard access, responsive open/close behavior, and no change to Epic's purple brand.

**Pass when:** Every visible navigation item opens the expected Epic route at desktop and narrow widths; focus and selected state are clear; existing Epic-only destinations remain reachable.

**Current state:** Shell and navigation foundations exist. Final source-to-Epic route-by-route comparison remains open.

### 3. Dashboard launchpad

**Scope:** Collection, requests, pending orders, pipeline tiles, attention queues, New Order, Search Customer, messaging shortcut, display-only business totals, and the workbook requirement that each operational shortcut opens a detailed, correctly filtered order list.

**Deliver:** Familiar, readable KPI cards that visibly distinguish a navigation shortcut from a display-only number and carry a clear filter to the destination.

**Pass when:** Each clickable card opens the correct filtered page with customer/order rows, display-only totals do not pretend to be buttons, and messaging stays behind an explicit send boundary.

**Current state:** Dashboard work and route shortcuts exist. Isolated-demo clicks confirmed Pending, Booking, Delivery, Delivered, Pending / Unassigned Pickup, Upcoming Delivery, Unassigned Delivery, and Express Delivery opening the correspondingly labeled queue views; each retains a readable filter banner. Both Order Requests shortcuts open Online Orders with `Needs acceptance` selected. The Collection shortcut passes readable `period=today` and its date range; the report opens with Today selected and both date inputs disabled, matching the observed source shortcut. Search Customer opens a keyboard-accessible lookup with store-scoped name/phone search, result-to-profile navigation, Add Customer, and Close; Cancel returns from the existing customer form without a create request. All three Dashboard New Order entry points were exercised. WhatsApp remains behind its review dialog, and the business revenue value was verified as display-only. A processing-role check now verifies Dashboard access, the customer shortcut is hidden for that role, and a delayed Dashboard response shows explicit loading feedback rather than the previous page. The combined Dashboard and role-access suite passes 6/6. Remaining work includes independent manual checks of all chart/marketplace/data states, full desktop/narrow/theme/error coverage, aggregate-to-detail consistency, and exhaustive source comparison; Phase 3 remains Partial.

### 4. Overview and statistics

**Scope:** Orders Review, Collection, Customer Frequency, New Customer, each selector's own date presets, custom date dialogs, charts, and Epic-only business metrics.

**Deliver:** Four independent, source-shaped range controls without merging Epic's additional metrics into source data.

**Pass when:** Changing or applying one range leaves the others unchanged; charts and totals use their own range; invalid custom dates cannot be applied.

**Current state:** Independent range controls, APIs, and focused tests are implemented. Remaining source dialogs and data-state comparisons are recorded in the audit ledger.

### 5. Customer lookup and customer workspace

**Scope:** Customer search and order-screen autocomplete, exact/partial matching, no-results behavior, Add Customer with phone and configurable fields, customer profile, addresses, order history, ledger, package/wallet/reward views, and quick dashboard lookup.

**Deliver:** A predictable search-to-select flow and a clearly separated create-customer flow, using existing Epic data and permissions.

**Pass when:** Search results are selectable without accidental creation; no match offers a reversible new-customer draft; admin-configured customer fields are respected; profile actions have clear read-only versus write labels.

**Current state:** Customer directory, work cards, Dashboard lookup, and order booking lookup exist. Order & Billing now supports searching and selecting an existing customer, shows a clear no-match state, and opens an Add Customer dialog prefilled from the search. Save calls the existing customer-create API, selects the returned customer, and carries its address into the current order draft; Cancel/Escape creates nothing and leaves the draft unbooked. The focused Playwright suite passes 4/4: three request-boundary cases use intercepted responses, and one creates a synthetic customer in the isolated temporary SQLite test server, then searches and selects that persisted record again without booking an order. The dialog was inspected at 390 px. The server customer self-test also passes in its temporary test database. The direct `/laundry/customers/:id` route now renders the previously unreachable full profile, and the Store Orders customer drawer links to it. Focused owner/counter/processing coverage checks profile edits, address confirmation, wallet/reward boundaries, order receivable separation, persistence and 390 px layout; `customer-workspace-parity.spec.ts` passes 2/2. In production web mode, the connected counter adapter supports only name and phone; unsupported fields/actions are hidden or described rather than fabricated. Admin-configurable customer fields do not yet exist in Epic Settings and remain open, as do source live recheck, actual production persistence, full error/data-state checks, wallet/order/finance reconciliation and the broader customer profile audit. Phase 5 is Partial.

### 6. Catalogue and pricing configuration

**Scope:** Garments, categories, services, units, editable garment prices, Store Charges, Store Discounts, tax defaults, rule status, price search, page size, duplicate-name handling, and the order-screen quick-add catalogue entry point.

**Deliver:** A familiar price/configuration flow with readable rule names and values, guarded Save actions, and consistent use of the active store catalogue.

**Pass when:** Authorized garment price edits save safely; filters and selectors use real configured records; a garment added from Order & Billing is validated and explicitly saved; duplicate labels can be distinguished; active/inactive rules behave consistently between Settings and Order & Billing.

**Current state:** Dedicated catalogue and pricing pages exist. Order & Billing now has a permission-gated Quick Add dialog for garment name/type, code, category/classification, unit, service, price, HSN and visual. Explicit Save creates the first garment/service price, refreshes the catalogue and selects the line in the current draft without losing its customer or existing items. The local API uses one transaction and idempotent key; the connected-web adapter checks duplicates and can resume a garment after a failed price request without overwriting another rule. A fresh authenticated, read-only MyUniClean review confirmed the separate Garment Pricing workspace, its garment/service/unit/status filters, price fields, and the Garments add draft. Epic now opens its pricing matrix and garment library from distinct Store Settings deep links, announces and focuses the chosen section, shows each price rule's category, and normalizes legacy service-name casing for display and filter matching without changing stored names or identifiers. Typecheck and a no-minify production Vite build passed. The earlier deep-link/filter browser check passed 2/2; after extending the price fixture with legacy casing/underscores, Playwright stopped producing output and was interrupted, so that latest service-label check remains inconclusive. The ordinary bundled Vite build currently hits a local memory allocation failure after typecheck, so that command is not treated as evidence for this slice. Evidence is in [`MYUNICLEAN_PHASE_06_WORKLOG.md`](parity/MYUNICLEAN_PHASE_06_WORKLOG.md). Remaining source delete semantics, authenticated connected-web persistence, complete source comparison and broader role/error/theme checks remain open; Phase 6 is Partial.

### 7. Spreadsheet imports and data correction

**Scope:** Garment-price and customer templates, supported file types, column validation, preview, row errors, correction downloads, and final import confirmation.

**Deliver:** A safe sample → select → review → commit workflow with row-level feedback and a clear result summary.

**Pass when:** Invalid files cannot write data; every accepted row is previewed before commit; failed rows can be corrected and retried without duplicating successful imports.

**Current state:** Read-only preflight and preview protections are implemented. Source comparison and full workbook edge cases remain in the ledger.

### 8. Store settings and operations administration

**Scope:** Store profile/address, UPI/invoice QR, staff and roles, packages, order-number series, message templates, and grouped Settings navigation.

**Deliver:** Source-familiar grouped editors that explain each setting and require an explicit Save/Update action.

**Pass when:** Each setting has a clear draft/save boundary, branch/role scope is enforced, and production-web persistence limits are visible rather than silently implying cross-device sync.

**Current state:** Many dedicated Settings pages and local tests exist. Some source semantics, remote persistence, and cross-role visual checks remain open.

### 9. Order & Billing

**Scope:** Customer autocomplete/selection, delivery type/date, category and service filters, garment search/cards/quantities, garment type and colour details, selected-order tray, item attributes, Charge, Discount, GST dropdown, payment methods and payment-link entry, notes/photos, totals, and Book Order.

**GST requirement:** Preserve Epic's 18% default. Make GST a direct dropdown; show the chosen mode in the draft immediately and refresh the existing server quote. Do not investigate or invent a separate GST formula.

**Deliver:** A compact order builder that feels familiar to MyUniClean users while retaining Epic's extra garment and operational fields.

**Pass when:** Every change is reversible in the draft; selected customer and garment details, tax/discount/payment choices and quote are visible before commit; generating a payment link is explicit and separately confirmed; only Book Order writes the order and produces a clear receipt.

**Current state:** The GST-enabled isolated demo defaults to the configured 18% rule. Order & Billing now presents a full-width `GST` dropdown with `None` and `GST (18%)`; selecting either updates the existing quote, and the former manual-rate input is removed from the staff booking surface. Unsupported legacy rates are surfaced for review and block booking until the operator selects a supported choice. Pricing E2E verifies server-returned tax for GST and None, zero order writes, a GST-disabled store, 390 px layout, and a saved 8% legacy draft that remains blocked until corrected. A synthetic unpaid 18% GST order also saves through shared-builder Edit Mode with matching total and a replacement canonical invoice snapshot. A separate 0% order attempt under the approved GST profile returned `TAX_RECONCILIATION_FAILED`; the meaning/validity of `None` at commit remains unresolved, and no tax formula or policy was changed. Order & Billing also exposes an explicit, permission-gated Add Customer flow: staff can select an existing match or save a new profile, return to the same draft, and cannot book while only unsaved legacy customer fields are present. The customer-flow E2E passes 4/4 and the server customer-create self-test passes in its disposable database. A fresh manual isolated-demo check covered customer search, Express/date, service/category filters, garment quantity and attributes, rule selectors, GST, payment and totals. It exposed a raw LNDRY `CLOUD_NOT_CONNECTED` alert in the demo; capability access now reads the active workspace and hides remote wallet/app-sync in demo mode, while disconnected production responses show a store-owner next step. Clear draft now resets customer, garments, delivery, date, pricing, filters, payment and notes; payment/category selection is accessible through `aria-pressed`. Vendor-access E2E passes 2/2; draft reset passes 1/1 with zero order writes and no 390 px overflow; GST/pricing E2E passes 3/3. The local demo server uses temporary SQLite with cloud auto-sync disabled, and manual verification booked no order. Production web still exposes only name and phone because its connected counter adapter only persists those fields; the quote formula and stored tax-rule configuration were not changed. Source `Including GST` / `Without GST` effect remains unresolved. Admin-configurable fields, production-web persistence, full garment validation, payment-link flow, final booking/receipt, connected vendor tiers and broader role/error/theme/source checks remain open; Phase 9 is Partial.

### 10. Store Orders, history, and status actions

**Scope:** Phone/order/customer search, status/date/user filters, list/grid, page size, exports, read-only Order History and Order Summary, selection, bulk actions, and a full order detail page with editing through the shared booking flow.

**Deliver:** A familiar order table with visible action labels and a strong separation between viewing records and changing statuses.

**Pass when:** Each filter produces the expected result; dashboard queue links retain readable filter context; Clear restores the baseline; the complete order page shows customer and order details; Edit reuses the booking form without losing data; read-only views do not mutate; batch status changes show selection count and confirmation.

**Current state:** Separate search fields, paging, history/summary views, and bulk boundaries exist. Isolated-demo E2E verifies that an eligible order opens in the shared booking builder with customer, delivery date, garment lines and line attributes hydrated; an unsaved note can be cancelled back to the same work card with zero order writes. A synthetic unpaid GST 18% order was also amended through the UI; the replacement invoice number, immutable canonical snapshot, tax/total, and persisted note were checked. A simulated concurrent edit confirms stale-version saves are rejected without replacing the newer invoice or discarding the operator's unsaved draft. The direct `/laundry/orders/:id` page displays saved invoice, order/due dates, source/reporter, payment and fulfilment details, item rates/attributes, aggregate subtotal/charges/discounts/GST/total, notes/photo, fulfilment events, payment ledger and timeline. E2E compares dates and saved financial/note values. The order-history suite passed 9/9 before the new stale-version case; that case passed separately (1/1). The grouped order-history, pricing, customer, and role regression passed 15/15; desktop and full 390 px screenshots were inspected. Synthetic 503 retry, 403 denied and 404 missing-record presentation states are covered; the 403/404 fixtures do not establish the live API permission/status contract. The shared permission map hides work-card Edit and Cancel from processing staff, hides progress entry without orders.edit, limits collection to payments.collect and reversal to payments.refund, and guards Edit URLs by orders.edit; counter/processing checks pass, including server rejection of a direct processing PATCH. Local bookings and edits now persist named charge/discount/GST breakdown snapshots, and the full order detail renders those saved labels; legacy orders use readable total-based fallbacks. Server-side 404/denied contracts, audit/history data coverage, remaining role combinations, cross-module reconciliation, and current MyUniClean source comparison remain open. Individual source status result sets also remain unresolved. Store Orders remains partial.

**Phase 10 continuation (1 October 2026):** Focused checks for all-pages XLSX export/retry (101 filtered rows), list/grid, bulk confirmation/version checks, and page-size navigation each passed 1/1. After an earlier storage exhaustion interrupted one run, the complete updated order suite passed 14/14 once machine storage recovered. See [Phase 10 worklog](parity/MYUNICLEAN_PHASE_10_WORKLOG.md).

### 11. Production, garment lifecycle, and quality

**Scope:** Production Queue, work cards, garment tags/tracking, receive/process/ready/deliver lifecycle, partial quantities, quality claims, corrections, rewash, and returns.

**Deliver:** A simple staff workflow that shows the next action for each garment/order and keeps item-level evidence attached to the correct order.

**Pass when:** Status changes are role-gated and audited; quantities cannot exceed booked amounts; corrections and returns preserve a readable history.

**Current state:** Epic's production and quality modules have an isolated full-path browser check: a synthetic order used the existing 18% GST rule, started Intake/Sorting/Processing/Quality Control tasks, and scanned one garment through Intake → Sorted → Processing → QC → Rewash. It checks task state/refresh, garment event history, duplicate-claim feedback, metric refresh, an urgent Rewash task, and the matching read-only correction document. A separate role E2E confirms counter staff cannot Start or Resolve (hidden controls and server 403 responses), while processing staff see those controls and pass permission checks without changing the fixture's open claim or task. Returns is an Epic extension because the supplied source audit does not map a Returns page: its focused browser suite checks order search, exact order-total and paise-precision guards, review-before-request, Cancel/Escape and service-failure draft recovery, duplicate detection, register empty/retry states, and the finance distinction between requested cases and actual refunds. No approval, rejection, or actual refund settlement exists. The new container-tracking E2E creates a synthetic 2.5 kg order, records Intake → Processing → Ready → Delivered, and proves a skipped Processing → Delivered transition leaves both saved state and event history unchanged. It also checks the customer handoff note and audit trail. `npm run test:garment-traceability` and the container E2E pass; the production task list uses one joined task/garment/order read, and the claim screen refreshes related views while keeping each action's feedback in its own section. Quality Claims, Returns, and container tracking desktop/390 px captures were inspected. All synthetic test writes stayed in Playwright's temporary SQLite database. This remains Partial: partial quantities, the remaining garment/container transitions and errors, assignment permissions, correction printing, return resolution/refund linkage, broader responsive/theme coverage, and live MyUniClean comparison remain open. The live reference browser was unavailable during the latest slice. See [Phase 11 worklog](parity/MYUNICLEAN_PHASE_11_WORKLOG.md).

### 12. Pickup, delivery, routes, and riders

**Scope:** Pickup assignment, delivery assignment, route planning, rider collection/delivery reports, proof of handoff, and exceptions.

**Deliver:** Clear pickup/delivery queues and route actions that retain Epic's existing dispatch capability.

**Pass when:** Assignment and delivery state transitions are traceable, actionable rows are distinct from summary values, and any sensitive confirmation is explicit.

**Current state:** Routing and rider modules exist. An isolated browser walkthrough creates a two-stop pickup run through Route Control, sets rider/zone/time/cadence, starts it, expands the stops, completes one stop, and skips the other with a required reason. Complete and Skip now show visible text with their icons. Read-after-write verifies that the completed order advances to Picked Up, the skipped order remains Booked, and the closed run and exception remain in route history. A second browser path prepares one synthetic Home Delivery garment through Processing → QC → Assembly → Racked, moves the order to Ready, creates and starts a Delivery run, verifies Ready → Out for Delivery, completes the stop, and verifies Delivered plus a closed route. The server `test:routes` self-test and both `route-control.spec.ts` cases pass against a fresh web build; active-run desktop/mobile evidence is visually inspected, and the 390 px page has no horizontal overflow. This remains Partial: live MyUniClean route interactions were not mapped in the supplied source audit and the source browser was unavailable; linked/unlinked rider-role isolation, cross-module report/fulfilment reconciliation, OTP/proof/signature, offline recovery, additional visual states, and completed-run history discoverability remain to verify. See [Phase 12 worklog](parity/MYUNICLEAN_PHASE_12_WORKLOG.md).

**Phase 12 continuation (1 October 2026):** A fresh build and rider browser test pass 1/1. Linked rider access is limited to assigned runs; assigned-run start/completion shows success feedback and advances the order. Cross-rider route mutations return 403; unlinked riders see no work; general order detail is denied. The visible denied-action feedback and role-first dispatch query are covered by the test. Live MyUniClean route comparison, cross-module reconciliation, proof of handoff, completed-run discoverability, and additional role/theme/error/offline checks remain open.

### 13. Finance and payment operations

**Scope:** Collection, payment allocation and payment-link settlement, refund/reversal, wallet boundaries, cash closing, Store Expense, finance setup, and customer/order balances.

**Deliver:** Clear money-in/money-out views, direct links from totals to records, and explicit confirmation for financial writes.

**Pass when:** Totals reconcile to filtered records; payment date and order date are not confused; refund/adjustment paths are permissioned and audited.

**Current state:** A synthetic Playwright end-to-end flow books a Pay Later order under the existing 18% GST rule, records a partial UPI collection with reference and note, confirms the payment date is distinct from order date, filters the Collection Report by date/method/reference, then reverses the collection with a required reason. UI, read-after-write summary, canonical fixed-paise entries, and report exclusion of the reversed receipt agree. The focused payment E2E passes 1/1; `cash-closing-flow.spec.ts` passes 1/1 and verifies opening a register, starting another shift with the same register name, cash collection reconciliation, a matching physical count, required variance explanation, approval attribution and close-drill equation. Its visual amount/count assertions caught a stale cash drawer display after payment; payment, reversal and cash-booking handlers now invalidate shift, history and close-drill queries. A new care-package browser flow creates a package, assigns it on account, searches for a customer, collects a cash partial payment into a selected one of two open registers, collects the balance by UPI, exhausts both included service units, and closes the drawer with a matching count. This exposed and fixed package cash missing from register totals, package receipts double-counted in the liability total, and the customer picker lacking search beyond its first 30 matches. Package liability, the cash drawer and the close drill now agree; `care-package-flow.spec.ts` passes 1/1 with two visual captures. A new isolated browser flow uses synthetic wallet-provider responses to book a partially wallet-paid order, verify the wallet collection, customer ledger, order balance and Balance Report, then collect the remainder by UPI and reconcile both tenders in the Collection Report. It caught and fixed initial order status being stored as Unpaid when a wallet paid only part; the order now starts as Part Paid. `wallet-finance-reconciliation.spec.ts` passes 1/1, and its fixed-paise wallet entry is 1,735 paise. `payment-link-safe-boundary.spec.ts` proves quote-matched UPI link preparation without booking/payment writes, rejects zero/excess precision, and checks no provider request; `cash-closing-role-access.spec.ts` verifies counter/owner/processing cash and link permissions. `expense-finance-reconciliation.spec.ts` records a synthetic ₹137.45 Cash expense and confirms the same amount in the filtered Store Expense ledger, Expense Report aggregate and daily row, and cash shift; ₹862.55 expected drawer and exact visible values pass before close. That test found stale drawer data after expense writes and paise rounding in finance displays; both are fixed, with two reviewed captures. Server package, cash-shift, reconciliation and typecheck checks pass, and the web production build succeeds. All local writes use Playwright's temporary SQLite database; wallet-provider endpoints were intercepted, and no live store/payment-provider transaction was made. Phase 13 remains Partial: real wallet reservation/cancellation/expiry and settlement, payment-link provider settlement, wider finance/report reconciliation, and role boundaries beyond owner/counter/processing, remaining error/theme states, and live source comparison remain open. Package expiry/report semantics also still require source verification. See [Phase 13 worklog](parity/MYUNICLEAN_PHASE_13_WORKLOG.md).

### 14. Reports, filters, charts, and exports

**Scope:** All 15 report routes, date presets/custom ranges, report-specific selectors, search, paging, chart periods, PDF/spreadsheet/print/refresh, and empty/populated/error states.

**Deliver:** One reusable report shell with domain-specific columns and controls, matching observed source labels without flattening distinct report behavior.

**Pass when:** Each report has its own documented contract; table and export use the same filters; chart ranges are independent where source shows independent controls; failures can recover by refresh.

**Current state:** Focused browser checks cover all 15 report destinations. The 16-case report/consolidated-invoice suite passed, covering date presets/custom ranges, report-specific views and fields, collection chart/table range independence, PDF output, empty/populated/error states, refresh recovery, page sizes and the locked warehouse-report boundary. The Collection Report filter/export contract passes and confirms custom dates, invoice view, payment method and search are sent with Export all; the visible page reports the full exported row count. A focused real-file check passes for the Page Excel `.xlsx` workbook's sheet name, columns and row values, and verifies Print invokes the browser print hook without report writes. Print-media emulation now confirms report details and the overview remain visible with readable filters/totals/table while navigation and actions are removed; both captures were inspected. The queued-export browser suite passes 2/2 for a 6,001-row report: filters reach the queue request, Running → Completed triggers a CSV download, and Failed shows the error without starting a download. The server `npm run test:e2e` passes a real worker-thread export, forced worker failure, new-job retry, CSV download, expiry transition and HTTP 409 rejection in a temporary database. New checks verify `reports.read` denies the report page and export endpoints to processing staff, and compare filtered table results to full-export rows for eight invoice/order/collection/balance/expense views. The Expense list, Expense Report and cash drawer now reconcile ₹137.45 precisely to paise. Phase 14 remains Partial: live source comparison, native browser/Electron dialog and printer-specific page breaks/margins, cross-module reconciliation across all financial report families, and broader role, keyboard, responsive and theme checks remain open. See [Phase 14 worklog](parity/MYUNICLEAN_PHASE_14_WORKLOG.md).

### 15. Epic-only features and simple discovery

**Scope:** Finance/production/marketplace and any other Epic capabilities that MyUniClean lacks; help text, labels, navigation placement, and workflows for those additions.

**Deliver:** Keep the extra capabilities, group them by the employee's task, use plain labels and familiar icons, and avoid adding duplicate entry points without purpose.

**Pass when:** Existing Epic-only functions remain accessible, employees can identify where each belongs, and each major task has a tested route from the dashboard or navigation.

**Current state:** The Epic-only workstreams are inventoried across Operations, Finance & compliance, Business controls, Customer programs, and the dedicated workspace routes; the dashboard tiles preserve the core daily launch flow. The desktop sidebar had Captain settlements twice, under both Pickup & delivery and Finance & compliance. It now appears once under Finance & compliance, while the Finance hub keeps its contextual card link for users already working there. The Operations hub still provides seven labeled routes. Sidebar route E2E and Operations hub E2E pass after the change. Phase 15 remains Partial: Finance/operations cards, business-control links and repeated Settings catalogue labels still need a purpose-by-purpose review with staff; the user-facing explanation and role matrix for every Epic-only workflow also need verification. See [Phase 15 worklog](parity/MYUNICLEAN_PHASE_15_WORKLOG.md).

### 16. Integrated manual QA and launch readiness

**Scope:** End-to-end daily work, roles, empty/populated/error data, desktop and mobile, keyboard/accessibility, light/dark theme, offline/recovery, visual comparison, and installation/browser launch.

**Deliver:** Final comparison report, regression results, known limitations, and a clean local build ready for the user's manual acceptance.

**Pass when:** Critical workflows pass from dashboard through booking, Store Orders, production/fulfilment, payment, and reporting; no unresolved high-severity blocker remains; all remaining differences are documented.

**Current state:** The production web build passes. A fresh isolated Playwright server run passed 22/22 selected regression cases across dashboard shortcuts, the 18% GST selector and quote, Store Orders detail/edit/cancel, garment/container traceability, pickup and delivery route actions, payment collection/reversal and visible report reconciliation. Separate report checks passed 16/16 plus the filtered-export contract 1/1. The integrated synthetic journey now passes 1/1 from Dashboard through order/customer creation, Store Orders, production scans, route completion, UPI collection, and Collection Report. The cross-module check found and corrected a canonical-vs-legacy invoice-number disagreement in payment summaries and collection reporting; route completion now provides accessible status feedback. The live MyUniClean workspace is authenticated again for read-only comparison: a fresh Order & Billing check verified the two GST option sets without choosing either, and a Store Orders check verified the populated table shape and disabled-by-default date controls in More Filters. Phase 16 remains Partial: launch in the user's installed browser/desktop has not been accepted; the complete role/theme/accessibility/error-state matrix is not exhausted; and the full source comparison has not yet been completed. No credential was requested or entered by the agent. See [Phase 16 worklog](parity/MYUNICLEAN_PHASE_16_WORKLOG.md).

## Reporting format after every phase

Each phase update will state: source pages/controls checked, Epic changes made, tests and manual checks passed, any remaining gaps, whether source data remained untouched, and the next phase. A phase is marked complete only after its pass conditions are met; implementation alone does not count as completion.
