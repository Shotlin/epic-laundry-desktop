# Phase 1 progress report — audit inventory and baseline

**Date:** 1 October 2026
**Status:** Partial. This is a progress report, not a phase-completion claim.

## Reference reviewed

- Read the supplied 1,270-line master brief, Sections 1–29, including all 16 phases and launch-readiness requirements.
- Read the product workbook `Lndry Tech and Product .xlsx`, worksheet `Sheet1`, rows 2–7. These six entries are product requirements supplied by the user. The Status and platform columns are blank, so they are not evidence of existing behavior, channel assignment, or completion.
- The saved MyUniClean field map and prior source audit remain available as historical evidence. The current browser automation transport returned `Transport closed`, so no fresh live MyUniClean click-through was possible in this slice.

## Epic reviewed

- `webapp/src/App.tsx`: 50 React route declarations, including the landing route, nested Laundry shell, route guards, dynamic report route, and fallback route.
- `webapp/src/components/laundry/LaundryShell.tsx`: 34 sidebar destinations and their declared permission labels.
- `docs/parity/EPIC_ROUTE_BASELINE.md`: route inventory now lists all 15 report destinations individually. Report rendering and accessible-name smoke do not prove each report's filters, data states, exports, or financial reconciliation.
- `webapp/e2e/visual-route-smoke.spec.ts`: current route, viewport, theme, and button-name coverage.

## Changes made

- Corrected the route baseline's false statement that the supplied master brief ended during Phase 15. The complete brief includes Phase 16 and the full launch-readiness definition.
- Expanded the route matrix from one generic dynamic-report row to 15 individually named report destinations.
- Added source provenance for the six workbook requirements and clarified that they are separate from observations about MyUniClean.
- Labeled the older 12-tranche phase ledger and the August 2026 system audit as historical, so their earlier `Complete`/`PASS` entries are not mistaken for completion of the current 16-phase goal.
- Fixed a role/UI mismatch found during the route audit. Counter staff now see the read-only catalogue routes already granted by the server. Marketplace edit/request controls now require the separate `catalogue.manage` permission; counter and processing views show an explicit read-only message.

## UI mapping findings

- The route tree declares 50 route elements; 34 destinations are declared in the sidebar. These are source-code inventories, not proof that every route and link behaves correctly for every role.
- All 15 report routes are present in the route matrix. Their page-specific control and data contracts remain open.
- A prior navigation sweep recorded duplicate `Captain settlements` entries under Pickup & Delivery and Finance & Compliance. Phase 15 removed the Pickup & Delivery placement and retained the Finance & Compliance placement; the contextual Finance hub card remains.
- Server role grants allow `catalogue.read` for counter and processing. The UI previously hid the counter routes and incorrectly used the read grant to show marketplace mutation controls to processing staff. The route map now matches the read grants, and mutation affordances use `catalogue.manage`.
- Captured the counter's read-only Catalogue at desktop and 390 px. The mobile viewport was visually inspected: the Epic shell, heading, read-only label, and metric cards remain legible and vertically stacked. A connected marketplace item was mocked to inspect the desktop read-only detail view.

## Functional checks and tests

- Ran `npm run test:e2e -- e2e/visual-route-smoke.spec.ts` from `webapp` against Playwright's temporary demo server and SQLite database.
- Result: **4/4 passed in 4.0 minutes**.
- 32 major routes rendered without the checked application errors at desktop widths 1024, 1280, 1366, 1440, 1920, and 2560 px.
- Those 32 routes passed page-level horizontal-overflow checks at 390 px in the default and dark appearances.
- Visible button accessible names passed at 1366 and 390 px across 45 route targets: 32 major routes plus 13 report routes; the remaining two report routes are included in the 32-route list, covering all 15.
- This suite does not exercise every control, filter, permission combination, data state, failure path, or cross-module dependency.
- Ran `npm run build`; TypeScript and Vite production build passed.
- Ran `npm run test:e2e -- e2e/role-access.spec.ts` after the rebuild; **1/1 passed**. It checks counter and processing navigation to both catalogue routes, read-only copy and absent mutation actions, in addition to existing finance/settings denials and work-route access. With a mocked connected marketplace item, price and availability fields plus pricing/stock save actions are disabled; the service-request action is absent; no POST/PATCH/DELETE marketplace request occurs.
- Re-ran `npm run test:e2e -- e2e/booking-pricing-dropdowns.spec.ts`; **3/3 passed**. The isolated Epic order draft showed `GST (18%)` selected when the store has GST enabled, offered `None` as the alternative, updated the existing quote on selection, and sent zero order-create requests. GST is not offered for a store configured without GST, and a saved legacy 8% choice requires an explicit supported selection before booking. This verifies Epic's selector and its use of the existing quote only; it does not inspect or change the tax formula, nor resolve MyUniClean's separate `Including GST` / `Without GST` control.

### Operations hub workstream navigation

- Added and ran `npm run test:e2e -- e2e/operations-hub-navigation.spec.ts`; **1/1 passed**.
- Clicked all seven workstream cards and verified the expected destination URL plus a rendered page heading. The test confirms navigation and initial content only; it does not verify the linked workflows' full business behavior.
- Captured and visually inspected the [desktop board](evidence/operations-hub-desktop.png) and [390 px board](evidence/operations-hub-mobile.png). The cards stack in one column on mobile; the automated 390 px overflow check passed.

## Responsive checks

The automated smoke covered six desktop widths and 390 px in the default and dark appearances. The changed catalogue role view was also captured at desktop and 390 px, and its mobile viewport was manually inspected. This did not include a manual keyboard-by-keyboard review, every modal state, or all intermediate breakpoints.

## Remaining gaps

- Fresh live MyUniClean route/control interaction mapping, once browser access is available.
- Full page-by-page control inventory: trigger, enabled state, data read/write, validation, confirmation, resulting view, reversibility, permission, and failure behavior.
- Populated, empty, loading, API-error, denied, keyboard, theme, and narrow-layout states for every significant route.
- Role-to-navigation and route-guard parity across the full route set.
- Customer/order/production/fulfilment/finance/report cross-module consistency.
- Requirement-by-requirement checks for the six workbook items.

## Data safety

No MyUniClean action or write was performed. Playwright suites use isolated demo databases; the role test created synthetic counter/processing accounts only in its temporary database. Marketplace responses were intercepted with a synthetic fixture item, so no connected vendor API was called or changed. The GST and Operations hub checks submitted no order, customer, or business-data writes. No production account or store record was changed.

Visual captures: [counter catalogue desktop](evidence/catalogue-readonly-counter-desktop.png), [counter catalogue mobile viewport](evidence/catalogue-readonly-counter-mobile-viewport.png), and [marketplace catalogue read-only state](evidence/marketplace-catalogue-readonly-counter-desktop.png).

GST selector evidence: [selected 18% option in the isolated Epic draft](evidence/gst-selector-panel.png). The browser-native open-menu rendering was not captured; the test verifies the available options and selected label through the accessible select.

Operations hub evidence: [desktop board](evidence/operations-hub-desktop.png) and [390 px board](evidence/operations-hub-mobile.png). Both were visually inspected; all seven cards remain readable in a single-column mobile layout.

### Sidebar navigation and disconnected platform states — 1 October 2026

- Ran `npm run test:e2e -- e2e/sidebar-navigation.spec.ts`; **1/1 passed** against the isolated local demo.
- Clicked all 35 visible sidebar placements at the time (34 unique destinations; Captain settlements appeared in two groups), checking each destination hash and visible page heading. Phase 15 reran the check against the updated 34-placement/34-destination navigation.
- The test exposed that Platform Orders, Platform Audit, and Platform Finance showed a generic disconnected message without a page heading. Added a shared `PlatformConnectionState` component and route-specific headings/descriptions while preserving the existing connection CTA.
- For each of those three routes, checked desktop and 390 px layouts for horizontal overflow, captured both sizes, and clicked `Open Platform Control` to verify navigation. No platform account was connected.
- Captures: [Platform Orders desktop](evidence/platform-orders-disconnected-desktop.png), [Platform Orders mobile](evidence/platform-orders-disconnected-mobile.png), [Platform Audit desktop](evidence/platform-audit-disconnected-desktop.png), [Platform Audit mobile](evidence/platform-audit-disconnected-mobile.png), [Platform Finance desktop](evidence/platform-finance-disconnected-desktop.png), and [Platform Finance mobile](evidence/platform-finance-disconnected-mobile.png).
- Re-ran `npm run build` after the shared-state implementation; TypeScript and Vite production build passed.
- These checks verify menu routing and disconnected states only. They do not verify page controls, populated/connected data, every role, or write workflows. Phase 1 remains Partial.

## Settings directory and owner workspaces — 1 October 2026

- Ran `npm run test:e2e -- e2e/settings-hub-navigation.spec.ts`; **1/1 passed** against the current production build and temporary demo server.
- Clicked all 13 Settings directory link placements and checked each destination route and visible page heading. Clicked the three in-page shortcuts for Store profile & UPI QR, Capacity/zones/racks, and Tags/printers; each selected its intended workspace.
- Opened all five workspace tabs (Workspace, Operations, Finance controls, Printing, Data safety) at desktop and 390 px. Each rendered; the document stayed within 390 px. The Finance controls table is wider than the viewport but is contained in its own horizontal-scroll region.
- The first responsive run found a real Workspace form overflow at 390 px. Added explicit single-column, shrinkable grids for the settings workspace and its responsive field/checklist grids. Rebuilt with `npm run build`; reran the Settings navigation/state test successfully. This preserves the wide desktop arrangement.
- Visual captures were inspected: [directory desktop](evidence/settings-directory-desktop.png) and [mobile](evidence/settings-directory-mobile.png); plus [Workspace desktop](evidence/settings-workspace-setup-desktop.png) and [mobile](evidence/settings-workspace-setup-mobile.png), [Operations desktop](evidence/settings-operations-setup-desktop.png) and [mobile](evidence/settings-operations-setup-mobile.png), [Finance controls desktop](evidence/settings-finance-controls-desktop.png) and [mobile](evidence/settings-finance-controls-mobile.png), [Printing desktop](evidence/settings-printing-setup-desktop.png) and [mobile](evidence/settings-printing-setup-mobile.png), and [Data safety desktop](evidence/settings-data-safety-desktop.png) and [mobile](evidence/settings-data-safety-mobile.png).
- `Garment pricing` and `Garments & services` both lead to `/laundry/catalogue`. This is recorded for Phase 15's information-architecture review; no duplicate route was added.
- Ran the 11 focused Settings specs: 15 test cases. Fourteen passed in the grouped run; one exposed a test locator clicking an already-open Pricing accordion shut before selecting its charge. Corrected the test to inspect the `<details>` state and reran `store-charges-parity.spec.ts`: **2/2 passed**. Across the grouped run and focused rerun, all 15 current Settings test cases passed.
- Those focused specs cover profile/address and UPI draft/update flows; charges, discounts, categories, services and units; users and packages; message templates; and order-number series. Test writes used request fixtures or Playwright's temporary SQLite workspace. The Settings directory/tab sweep made no POST/PATCH/PUT/DELETE requests. No MyUniClean or production store data was written.
- The directory sweep does not exercise guarded finance-normalization/backfill actions, backup/restore, staff/branch creation, tag-template save, printer-profile creation, or every field's validation/error/permission behavior. These remain explicit Phase 1 gaps.

### Overview and Store Expense controls — 1 October 2026

- Re-ran `npm run test:e2e -- e2e/overview-independent-ranges-parity.spec.ts`; **1/1 passed**. All four Overview preset lists were checked. Each selector updates only its own server query range; Collection Custom Cancel retains Week, and Apply sends the chosen start/end dates while preserving the other three ranges.
- Inspected populated synthetic Overview state at desktop and 390 px, and the custom-date dialog at 390 px. These API-intercepted values verify rendering and filter context, not reconciliation against real store totals. Captures: [Overview desktop](evidence/overview-populated-desktop.png), [mobile](evidence/overview-populated-mobile.png), [mobile custom range dialog](evidence/overview-custom-range-dialog-mobile.png).
- Ran `npm run test:e2e -- e2e/store-expense-parity.spec.ts e2e/role-access.spec.ts`; **4/4 passed**. Expense controls covered required fields, 100-character name limit, Cancel with zero write requests, populated/empty search results, applied date filters, Clear dates while retaining search, refresh, list/grid switching, print, spreadsheet and PDF exports. Synthetic expense fixtures intercepted list responses; no expense was saved.
- Ran `server: npm run test:laundry`; passed. Added backend assertions for expense receiver search and no-match search alongside existing date-range checks in the disposable self-test database.
- Role evidence: counter can open Store Expense and read its API; processing staff see no link, are denied at the route and receive API 403. The current endpoint uses `expenses.create` for list and mutations; no separate read-only expense grant/role is defined. This remains a permission-policy question, not an assumed access expansion.
- Captures visually inspected: [populated desktop](evidence/expense-populated-desktop.png), [date/search empty result](evidence/expense-filtered-empty-desktop.png), and [populated mobile](evidence/expense-populated-mobile.png). The 390 px page remains within viewport; its table is horizontally contained.
- The available source audit records an empty expense list and an Add Expense modal, but the live browser currently returns `Transport closed`. Populated source rows/grid, tax checkbox enablement, write/edit/cancel outcomes, production persistence, API errors and a read-only expense role remain unverified. No MyUniClean or production data was changed.

### Collection Report controls — 1 October 2026

- Updated the shared `ReportDateFilter` so custom From/To inputs constrain one another; an inverted saved/input range shows an explanation and disables Apply.
- Ran `npm run build` in `webapp`; TypeScript and Vite production build passed.
- Ran `npm run test:e2e -- e2e/report-recovery.spec.ts --grep "validates table dates"`; **1/1 passed**. It checks the six source-shaped Report By options, today context, custom table filter requests, Cash method filtering, independent chart/table dates, custom chart Cancel/Apply behavior, a 390 px dialog, and zero write requests.
- Then ran the complete focused regression group, `npm run test:e2e -- e2e/report-recovery.spec.ts e2e/store-expense-parity.spec.ts e2e/role-access.spec.ts`; **19/19 passed** across report recovery/contracts, Expense workflows, and owner/counter/processing access. `server: npm run test:laundry` also passed after adding backend expense-search assertions.
- Captures visually inspected: [Collection Report desktop](evidence/collection-report-controls-desktop.png) and [custom chart dialog at 390 px](evidence/collection-chart-custom-range-mobile.png). The table/chart values are intercepted synthetic data; they do not prove live store reconciliation.
- Remaining: positive/negative report search semantics, exports matching filters, populated source comparisons, every report's unique control contract, dark/error/role states, and the final all-15-report crosscheck. MyUniClean remains read-only; the browser connection still returns `Transport closed`.

### Store Orders list and read-only history — 1 October 2026

- Ran `npm run test:e2e -- e2e/order-history.spec.ts`; **4/4 passed**. The nine status choices support multi-select and only apply on Search; the selected In Process + Done set produces the documented Epic In Process + Ready rows. Separate Phone No, Order No and Customer fields apply together. Clear resets all fields and restores the baseline result (React Query can serve the valid baseline from cache, so an extra refresh is unnecessary). Date filters apply only on Search; a reversed date range displays an explanation and disables Search.
- Opened Order History and Order Summary separately. The history dialog is read-only, keeps keyboard focus, closes with Escape and sends no order mutation. The summary opens the existing operational work card; no action was activated.
- Captures visually inspected: [history desktop](evidence/orders-history-modal-desktop.png), [summary desktop](evidence/orders-summary-modal-desktop.png), [history at 390 px](evidence/orders-history-modal-mobile.png), [mobile Store Orders search](evidence/store-orders-search-mobile.png), and [invalid date range](evidence/store-orders-invalid-date-filter-desktop.png). Mobile page width stayed within 390 px; the narrow table remains horizontally contained.
- Remaining: live source status result sets beyond the observed combined union, source date-control behavior, populated row/detail field parity, work-card edit and status-change confirmations, exports, API failures, other roles/themes and reconciliation with production/finance/dispatch. This evidence does not mark Store Orders or order detail complete.

### Store Orders shared-builder Edit Mode, Cancel and controlled save — 1 October 2026

- The shared-builder hydration/Cancel test passed **1/1**; the controlled-save test passed **1/1**; then `npm run test:e2e -- e2e/order-history.spec.ts` passed **6/6**.
- Selected an eligible seeded order from the list response, opened its work card, and entered Edit in order builder. The test checks the edit URL retains the selected ID and that the shared builder hydrates the same customer name/phone, delivery date, garment/service/quantity, colour and care type. It also checks the payment-preservation message.
- Changed only the local order-note draft, then used Cancel amendment. Epic returned to the same work card, the unsaved marker was absent, and no POST/PATCH/PUT/DELETE request to an order endpoint occurred.
- A second test created a synthetic unpaid order at the configured 18% rate in Playwright's temporary database, found it through Store Orders, and saved a note amendment in the shared builder. It verified one order PATCH, the same stable order ID with an incremented version, a new replacement invoice number, unchanged 18% tax and total, persisted note text, and a new immutable canonical invoice snapshot linked to the replacement invoice. The canonical-snapshot route returns the snapshot currently linked by the order.
- This exposed and fixed a backend identity defect: canonical snapshots had been deduplicated only by stable order ID, causing an amended order to reuse its original invoice snapshot. Snapshots now retain the stable `sourceOrderId` and also identify their `sourceInvoiceId`; the order keeps a pointer to its current snapshot while prior snapshots remain preserved.
- Ran `server: npm run test:invoice-snapshot` and `server: npm run build`; both passed. The E2E confirms the save result and API projection; the existing self-test confirms the original invoice is cancelled and both canonical snapshots remain present.
- Captures visually inspected: [shared builder desktop](evidence/order-edit-builder-desktop.png) and [shared builder at 390 px](evidence/order-edit-builder-mobile.png). The responsive width check passed; the narrow page stacks the customer, service and garment controls without document-level horizontal overflow.
- An isolated 0% booking attempt while the store's approved GST profile was active returned `TAX_RECONCILIATION_FAILED`. No tax rule or formula was changed; whether `None` is valid for a particular store/item and how to explain that boundary before commit remain unresolved.
- Remaining: optimistic-concurrency/API failures, full detail-field/source-equivalent semantics, role restrictions beyond the tested work-card controls, audit/history rendering, downstream finance/production reconciliation, and the GST `None` commit rule. The live source browser was not available for this slice; MyUniClean and production data were not changed. All order writes in the save test were confined to Playwright's temporary database.

### Store Orders work-card permission boundary — 1 October 2026

- Extracted the shared UI permission map to webapp/src/lib/permissions.ts, so route guards, navigation, booking controls and the order work card use the same role rules.
- Edit in order builder and Cancel order require orders.edit; the shared builder's edit URL is guarded by orders.edit while a new-order URL still requires orders.create.
- Fulfilment entry requires orders.edit; processing staff retain read-only event history. Collection entry requires payments.collect; payment reversal requires payments.refund (owner-only in the current role map). The ledger and due balance remain readable.
- Expanded role-access.spec.ts: counter can see the Edit entry; processing can read an active order but sees no edit, cancel, progress, collection or reversal actions. A direct processing PATCH returns 403 and direct builder Edit access is denied. No test mutation was accepted.
- npm run build passed. npm run test:e2e -- e2e/role-access.spec.ts passed 1/1; npm run test:e2e -- e2e/order-history.spec.ts passed 6/6, including shared-builder hydration/Cancel and the 18% GST replacement-invoice case.
- Writes remain limited to the Playwright temporary SQLite database for the separate GST fixture; role-boundary checks only read orders and confirm server rejection. No source-account or production-store data was changed.
- Remaining: this validates selected work-card controls only. Other role/route combinations, per-control permissions across every module, direct detail-page contract, API error/concurrency paths and live MyUniClean comparison remain open. The source browser was unavailable in this slice.

### Store Orders direct Order Detail page and recovery — 1 October 2026

- Replaced the direct orders/:id redirect to the Store Orders drawer with a page presentation of the existing Order Detail work card. It reuses the existing order-detail data and permissions rather than maintaining a second detail implementation.
- The page has a visible Back to Store Orders action, preserves the order URL, and opens the shared Edit Mode. Edit Mode now accepts only the matching order-detail return path; Cancel returns to the same detail page. Existing drawer-origin edits continue returning to the drawer.
- Added a readable load-error state with Retry and Back actions. A Playwright fixture returns one synthetic 503, then allows the retry to load the same order; the UI does not expose the raw endpoint/status as its only guidance.
- Verified the customer and phone, order number, status, item summary, desktop and 390 px width, retry, shared Edit URL and Cancel return. A separate synthetic unpaid 18% GST order now saves through this direct-page Edit path; the replacement invoice/canonical snapshot, stable tax/total, persisted note, and return to the same detail URL pass. Captures: order-detail-page-desktop.png, order-detail-page-mobile.png and order-detail-retry-state-desktop.png.
- Rebuilt the web app, then ran npm run test:e2e -- e2e/order-history.spec.ts e2e/role-access.spec.ts; **8/8 passed**. The detail retry was tested against a synthetic intercepted failure; all other reads used the Playwright temporary database.
- This verifies the direct route's main path, one retry recovery path, and 18% GST save return, not every detail field, 404/permission case, stale version, finance/production reconciliation, all roles, or source behavior. MyUniClean remained read-only and unavailable through the browser transport.

### Direct Order Detail complete-record display — 1 October 2026

- Added a page-only order summary with invoice, booked/due dates, source, reporter, payment method/status, fulfilment mode, pickup/delivery slots, service zone and delivery address. The drawer keeps its compact layout.
- Added a saved-price summary showing subtotal, charges, discounts, stored GST rate, stored GST amount and grand total. These fields are rendered from the order record; the quote/tax calculation was not changed. Line items now expose the saved unit rate on the full page, and order notes/photo state is visible.
- Extended the isolated GST order E2E to compare the rendered date, financial values, 18% GST, saved note, item attributes, and invoice against the booked record. `npm run test:e2e -- e2e/order-history.spec.ts` passed **7/7**; the dedicated direct-page retry/responsive case passed **1/1** after adding full-summary assertions at 390 px. The existing 503 retry path, edit/cancel return path, and zero-mutation assertion continue to pass.
- Ran `npm run build`; TypeScript and Vite production build passed. Captured and visually inspected [full desktop detail](evidence/order-detail-page-full-desktop.png) and [full 390 px detail](evidence/order-detail-page-full-mobile.png); no horizontal document overflow was reported.
- Order booking/amendment fixtures and reads stayed in Playwright's temporary SQLite database. MyUniClean and production data were not changed.
- Still open: source comparison, rule-level charge/discount labels (the order API persists aggregate amounts only), 404 and denied-state coverage, stale-version/API failure recovery, broader role coverage, and finance/production cross-module reconciliation. Full Order Detail remains partial.

### Order Detail error-state recovery — 1 October 2026

- Classified direct-order failures into temporary service errors, forbidden access, and missing records. Only a potentially temporary failure offers Retry; 403/404 states explain the next safe action and keep Back to Store Orders available.
- Added intercepted 403 and 404 browser fixtures. They assert the correct user-facing explanation, absence of a misleading Retry button, and zero order writes. The existing synthetic 503 → Retry path still passes.
- `npm run build` passed. Combined `npm run test:e2e -- e2e/order-history.spec.ts e2e/role-access.spec.ts` passed **9/9**, including full saved-detail value assertions, 390 px no-overflow, and counter/processing UI/API permission checks.
- The 403/404 response fixtures verify presentation only; they do not prove the server returns those status codes for every real role or that an unknown ID maps to 404 in every adapter. Those live endpoint contracts remain open for Phase 1.
- No live MyUniClean or production records were read or changed in this slice. All order fixtures and writes were in Playwright's temporary database; simulated error cases performed no writes.

### Customer workspace route and finance boundary — 1 October 2026

- The customer profile work card existed, but opening `/laundry/customers/:id` redirected to Store Orders. Changed the route to render the full profile and added a visible path from the Store Orders customer drawer. Dashboard Search Customer → result drawer → full profile now stays an understandable, direct navigation path.
- Matched the profile surface to the available adapter data. Local SQLite profiles may show supported wallet, reward, package and address information. Connected web profiles do not invent zero balances or empty histories for data the adapter cannot supply; unsupported owner-only actions are hidden and an explanation identifies the adapter boundary.
- Corrected customer order balance and activity projection so standalone wallet credits/debits are not counted as order receivables or duplicated beside the wallet ledger. Order-applied payments remain part of the order ledger. Wallet amounts preserve paise; wallet rupees and integer reward points use separate inputs, reasons and validation. Address archive requires confirmation.
- Added an isolated owner/counter/processing walkthrough. It checks profile route and tabs, edit/save/cancel, address save/cancel/archive confirmation, owner wallet and reward adjustments, persistence after reload, independent order balance, exactly-once activity, Dashboard-to-profile navigation, 390 px overflow, and role/API denials. No connected MyUniClean or production record was changed.
- Verification: `webapp: npm run build` passed; `server: npm run typecheck` passed; `server: npm run test:customer` passed; focused `npm run test:e2e -- e2e/customer-workspace-parity.spec.ts` passed **2/2** against Playwright's temporary SQLite/demo server.
- Captures: [customer work card desktop](evidence/customer-workspace-desktop.png), [mobile](evidence/customer-workspace-mobile.png), [Store Orders customer drawer desktop](evidence/customer-work-card-drawer-desktop.png), and [mobile drawer](evidence/customer-work-card-drawer-mobile.png). The focused test inspected the profile at desktop and 390 px and asserts no document-level horizontal overflow.
- Remaining: compare the customer profile field-by-field against the authenticated live source; verify connected web persistence and which web services support wallet/rewards/packages/address operations; audit package redemption, wallet application/refund/reconciliation across orders and finance; and cover broader API failure/theme/keyboard states. This fixes the route and selected safety boundary but does not complete Customer 360 or Phase 1.

### Production, garment lifecycle and quality — 1 October 2026

- Added an isolated browser journey that books one synthetic garment with the store's existing 18% GST rule, starts Intake, Sorting, Processing and Quality control tasks, and scans the same garment through Intake → Sorted → Processing → QC. Each scan returned HTTP 201, retained its event on the same garment/order, completed the prior task, and generated the next stage task. The queue Start controls returned HTTP 200 and visibly changed each task to In Progress.
- Resolved a Stain claim as Rewash. The UI rejected a duplicate open claim with a visible server explanation; correcting the failed form cleared that error. After resolution, the metrics updated, the garment reached Rewash with a QC → Rewash audit event, and an Urgent Rewash task included the operator reason. The correction register displayed the matching garment's read-only customer message and Print copy control; printing itself was not activated.
- The E2E exposed slow task projection caused by repeating per-task database lookups. Added a single joined SQLite projection for task/garment/order context, while retaining the point read for a single Start/Assign result. Production queue views now share invalidation across task starts, scans and quality decisions.
- Separated claim-open and claim-resolution feedback so each success appears beside the action it describes. The 390 px quality screen was visually inspected and had no document-level horizontal overflow. Final captures: [desktop](evidence/production-quality-desktop.png) and [390 px](evidence/production-quality-mobile.png).
- Verification: `webapp: npm run build` passed; `server: npm run typecheck`, `npm run test:laundry`, and `npm run test:garment-traceability` passed; `webapp: npm run test:e2e -- e2e/production-quality-lifecycle.spec.ts` passed **1/1** after the queue cache and feedback fixes.
- Test order, customer, garment, claim and correction writes stayed in Playwright's temporary SQLite database. The live MyUniClean tab was not available through the computer-use transport in this turn; MyUniClean and production data were not changed.
- Remaining at this checkpoint: partial quantities, additional valid/invalid lifecycle transitions, tag/container modes, claim decisions besides Rewash, correction print behavior, Returns resolution/refund lifecycle and role coverage, role-by-role server/UI permissions, failure/recovery states, additional mobile widths/themes, and source field/interaction comparison. The Returns request page is audited in the following entry; its lifecycle and finance boundaries remain open. Production/quality routes and Phase 11 remain **Partial**.

### Production and quality role boundary — 1 October 2026

- Extended the isolated counter/processing role walkthrough with one clearly labeled synthetic open claim in Playwright's temporary SQLite database.
- Counter staff can open the Quality Claims page and see/open the claim, but the Resolve selector/button is absent. A direct resolve request returns 403; a validation-only claim-open request passes the permission gate and returns the expected 400 for its incomplete payload.
- Counter staff see no Start control on an open production task, and a direct Start request returns 403. Processing staff see the claim-resolution controls and production Start control; invalid decision and missing-task requests return the expected post-permission validation errors. No staff claim or production task state was changed.
- `webapp: npm run test:e2e -- e2e/role-access.spec.ts` passed **1/1** after adding the required idempotency key to the invalid-task fixture. No screenshots or source-account writes were created by this role check.
- This closes only the counter/processing start/resolve UI/API boundary for selected records. Assignment permissions, valid staff writes, other roles, Returns and finance reconciliation, additional errors, and live MyUniClean comparison remain open. Phase 11 remains **Partial**.

### Returns request workflow and finance boundary — 1 October 2026

- The supplied MyUniClean route map does not identify a Returns module. Returns is therefore recorded as an Epic extension, with no source-parity claim.
- The Returns page now searches orders, shows the selected customer and exact order total, rejects amounts above the order total or with more than two decimal places, and requires a review step before creating a request. Cancel/Escape preserves a safe draft; transient service errors preserve the draft and allow retry; duplicate requests return the existing case instead of creating another.
- The register includes order number and customer name. The finance read model counts requested cases separately from actual refunds; this confirms the accounting boundary for requests only and does not implement or prove a refund settlement lifecycle.
- `webapp: npm run test:e2e -- e2e/returns-flow.spec.ts` passed **2/2**. Coverage includes empty/error/retry register state, no-write review/cancel, over-total and paise-precision validation, duplicate request, simulated 503 recovery, and request-vs-refund finance totals. `server: npm run typecheck` and `npm run test:management` passed. Desktop and 390 px captures at [desktop](evidence/returns-flow-desktop.png) and [390 px](evidence/returns-flow-mobile.png) were visually inspected; the mobile test asserts no document-level horizontal overflow.
- All order/case/finance fixtures were synthetic and confined to Playwright's temporary SQLite database. The MyUniClean tab was not available through the computer-use transport; no source or production data was read or changed.
- Approval/rejection, actual refund posting, complete request history, role-specific Returns permissions, broad finance reconciliation and live source comparison remain open. Returns and Phase 11 remain **Partial**.

### Order & Billing live control check and draft recovery — 1 October 2026

- The browser initially had no local backend listener. Started the isolated demo server on port 3002 with a fresh temporary database and cloud auto-sync disabled; health reported `ok` and `/api/workspace/status` reported `demo`. Signed in with the seeded demo login and verified the real rebuilt browser UI. The MyUniClean session was not present in the available browser inventory.
- Manually exercised customer search/selection, Express delivery and expected date, Dry Cleaning service filter, Men's Wear category filter, add-garment quantity, care-type and colour attributes, charge/discount/GST selectors, payment selection, quote totals, and the disabled/ready booking boundary. No order was booked.
- Selecting a local demo customer exposed raw `CLOUD_NOT_CONNECTED`: local demo mode treated LNDRY wallet/app sync as unrestricted and issued a vendor wallet request that cannot work in the demo. `useVendorAccess` now reads the active workspace and fails closed for demo/unknown mode; user-facing disconnected errors now explain the owner action and let staff continue without wallet/app sync.
- The live manual check found that Clear draft removed the selected customer/garment but retained Express delivery. It now resets the whole reversible booking state, including delivery mode/date, customer, line attributes, filters, price rules, payment choice/reference, notes, manual adjustments and wallet approval. Category and payment choices now expose `aria-pressed` to keyboard and screen-reader users.
- Verification: `webapp: npm run build` passed. `booking-draft-safety.spec.ts` passed **1/1**, `booking-vendor-access.spec.ts` passed **2/2**, and `booking-pricing-dropdowns.spec.ts` passed **3/3**. The synthetic tests assert no order creation; all browser records remained in temporary SQLite. Manual reset state was visually checked and has no 390 px page overflow; evidence: [mobile Clear draft state](evidence/order-draft-clear-mobile.png).
- These checks cover the isolated local demo and simulated disconnected production capability only. Real connected vendor tiers, source tax-mode semantics, Add Garment, full payment link flow, final booking/receipt, broader errors/roles/themes and MyUniClean comparison remain open. Phase 1 and Phase 9 remain **Partial**.

## Next step

Continue Phase 1 with the remaining page-level control/state and permission evidence against the isolated Epic demo; resume live source comparison when its browser session is available. Keep Phase 1 Partial until each route/control has evidence or a recorded access boundary. Do not advance the roadmap to Phase 2 until the baseline acceptance conditions are satisfied or explicitly recorded as inaccessible.
