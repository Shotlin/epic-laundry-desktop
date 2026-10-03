# MyUniClean parity — Phase 14: reports, filters, charts, and exports

**Status: Partial.** This worklog describes the local Epic report checks completed in the current slice. It does not claim a fresh live MyUniClean comparison: the authenticated reference browser was unavailable.

## Coverage

The focused suite opens and checks all 15 report routes: Invoice, Collection, Order, Consolidated Invoices, Customer, Customer Package, Customer List, Growth, Discount, Expense, Balance, Pickup Overview, Rider Delivery, Rider Collection, and Warehouse User Work.

The report contracts cover representative route-specific table fields, totals/views, date presets and custom ranges, paging controls, Collection payment-method filtering, independent chart/table ranges, inverted-date protection, no-data and populated states, transient report-load failure with Refresh recovery, PDF file signature, and the warehouse report's activation lock and protected endpoints.

`webapp/e2e/report-page-output.spec.ts` now verifies the Page Excel button downloads a valid `.xlsx` workbook containing the visible page's exact columns and row values. It also replaces the browser's native print dialog hook with a test observer, clicks Print, confirms the browser print action is invoked, and checks the report routes issued no write requests. The workbook response is intentionally deterministic/mock data; native print-preview layout remains outside this browser automation check.

## Browser print-preview layout

Print-media emulation exposed that the global receipt/tag fallback hid the entire application root, which also hid both report pages. Report detail and Reports overview now opt into a dedicated print layout. Detail print output preserves the report title, active date/view/payment/search context, total and visible table; it hides navigation, filters, action buttons, pagination and the interactive chart. The overview keeps its dashboard-style totals, reconciliation and report sections. Landscape print CSS makes detail tables fit the page and repeatable content remains available for browser pagination. The native OS/Electron dialog, printer margins and physical page breaks still need a headed/manual check.

The two Playwright captures `evidence/report-print-preview.png` and `evidence/report-overview-print-preview.png` were visually inspected after applying `page.emulateMedia({ media: 'print' })`.

Report access now uses the dedicated `reports.read` permission in both the route and navigation. `webapp/e2e/report-export-permission.spec.ts` verifies processing staff cannot see or open Reports and receive 403 responses from report, full-export, queued-export, and export-job endpoints.

## Filter-to-export verification added

`webapp/e2e/report-export-filters.spec.ts` stubs report data and confirms the Collection Report's active `from`, `to`, invoice view, payment method, and search values are all included in the `Export all` request. The test confirms a download is produced and the UI reports the complete export row count. The test is an isolated UI/API contract check; the response is mocked and does not establish export correctness against real store data.

## Large queued export UI states added

`webapp/e2e/queued-report-export.spec.ts` supplies a report with 6,001 rows, above the direct-download threshold, and verifies that `Export all` queues the date and search context. A mocked job moves through Running to Completed; the UI starts a CSV download with the expected filename. A separate mocked job returns Failed; the UI shows the worker error and does not request a download. These two browser checks cover UI state handling only. The server's `test:e2e` also exercises a real worker-thread export through Completed and downloads its BOM/CRLF CSV in a temporary database.

The server E2E now also forces a real worker write failure in the temporary workspace, confirms the job becomes Failed with a storage error, retries as a new job after removing the blocker, and verifies that the retry completes and downloads. It then moves that completed job's expiry timestamp into the past inside the temporary SQLite fixture and confirms the job becomes Expired and the download endpoint responds with HTTP 409 and the explicit expiry message. No production export directory or store data is touched.

`webapp/e2e/report-full-export-equivalence.spec.ts` creates a synthetic order, partial UPI receipt, and expense in temporary SQLite. It compares the real filtered table response with the full export for eight views: invoice, order invoice, order service, collection invoice, collection customer, balance invoice, balance customer, and expense. It checks filter parity, columns, row values/counts, and no truncation. The expense row retains its exact paise amount.

## Verification results

- `webapp`: `npx playwright test e2e/report-recovery.spec.ts e2e/consolidated-invoices-parity.spec.ts` — **16/16 passed**.
- `webapp`: `npx playwright test e2e/report-export-filters.spec.ts` — **1/1 passed**.
- `webapp`: `npx playwright test e2e/report-page-output.spec.ts` — **3/3 passed**; XLSX signature/structure/content verified, Print invocation with zero report writes, and both report detail and overview retained visible content in print-media emulation.
- `webapp`: `npx playwright test e2e/queued-report-export.spec.ts` — **2/2 passed**; large-export Running → Completed download and Failed state with no download.
- `webapp`: `npx playwright test e2e/report-export-permission.spec.ts` — **1/1 passed**; processing role denied in navigation, page, and report/export APIs.
- `webapp`: `npx playwright test e2e/report-full-export-equivalence.spec.ts` — **1/1 passed**; table/full-export parity across eight report views using synthetic local records.
- `server`: `npm run test:e2e` — **passed**; real worker success, failure, new-job retry, CSV download, expiry transition and rejected expired download covered in temporary SQLite.
- `server`: `npm run typecheck` — passed.
- Existing focused report/expense/role regression recorded in the master matrix — **19/19 passed**.
- Collection Report desktop capture and custom chart-range dialog at 390 px were visually inspected.

## Remaining work before Complete

- Reopen the authenticated reference and compare every report route, populated data state, label, filter choice, chart and total.
- Verify the real browser/Electron print dialog, printer-specific page breaks and margins; current checks use Chromium print-media emulation.
- Verify the table/full-export comparison for queued exports and additional report-specific search/date semantics.
- Reconcile representative report totals with orders, receipts, refunds, expenses and customer balances.
- Verify report permissions, keyboard flow, responsive layouts and supported themes across the report family.

See the [16-phase roadmap](../myuniclean-16-phase-execution-roadmap.md), [master parity matrix](MASTER_PARITY_MATRIX.md), and [known verification gaps](NEEDS_VERIFICATION.md).
