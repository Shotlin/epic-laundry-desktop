# Operator simplification audit — 3 October 2026

## Purpose

This is the current review of Epic Laundry's operator screens. It checks that a counter, care-floor, delivery, and office user can find the next task, understand whether a button changes data, and return safely from a work area.

The reviewed reference is the supplied MyUniClean field map and screenshots. Epic Laundry keeps its own brand and additional operations, finance, marketplace, and workforce capabilities. The familiar parts use the same practical operating pattern: a clear queue, a clear next action, readable filters, a selected-record view, and an explicit final save or status action.

## What was reviewed

| Area | Operator job | Simplified entry point | Current status |
|---|---|---|---|
| Dashboard | Choose the next daily task | KPI shortcut, pipeline, attention list, quick actions | Verified in source and dashboard flow checks |
| Overview | Understand business activity | Six metric cards followed by full-size visual panels | Improved and built |
| Counter | Book and find customer orders | Order booking, Store orders & customers, Print centre | Verified through primary flows |
| Production | Move garments through care and resolve issues | Operations centre, tracking, production queue, quality claims, corrections, returns | Routed and documented |
| Pickup & delivery | Assign and complete field work | Route runs and Pickup & delivery queues | Routed and documented |
| Finance & compliance | Record costs, close cash, inspect reports | Finance hub, statutory, cash closing, expense, settlements | Primary ledger flow checked |
| Customer programs | Apply customer benefits | Care packages and customer workspace | Routed and documented |
| Business controls | Maintain the operating model | People, finance setup, online orders, catalogue, imports, settings, reports | Routed and documented |

## Changes made in this review

### Overview

- Removed the decorative mini-bars from the six headline cards. Cards now show the metric, a short explanation, and a purpose-specific icon.
- Added full-size visual panels for revenue performance, order volume, collection trend, average order value, customer mix, and new-customer acquisition.
- Kept the existing booked-value, lifecycle, customer-visit, and service-demand views as supporting analysis.
- Added clear single-day and empty-range states. A one-day filter shows the actual value in a readable card; an empty range explains that there are no matching records instead of drawing a misleading chart.
- Kept the four date controls independent, so changing Collections does not silently change Orders, Customer Frequency, or New Customers.

### Dashboard and navigation

- Moved Quick actions directly below the primary dashboard KPIs, so New order, Search customer, and Send WhatsApp are available before lower-priority detail.
- Preserved visible links from dashboard cards to filtered queues and reports.
- Confirmed the full-screen workspaces use a labelled **Back to dashboard** route, rather than depending on a sidebar which is intentionally hidden in focused work areas.

### Operator safety

- The manual distinguishes browsing and filtering from actions that write records: booking, saving, changing a status, importing, closing a shift, sending a message, and refunding.
- Read-only history and summary actions remain separated from status-changing actions.
- Booking prevents catalogue items with a zero usable price from being submitted. Pricing, GST, charge, and discount rules are selected through readable controls before the final booking action.

## Verification record

| Check | Result | Evidence |
|---|---|---|
| Frontend production build | Passed | `npm run build` completed after the Overview and Dashboard changes. |
| Dashboard shortcut flows | Checked | Collection, order queue, New order, customer lookup, and guarded WhatsApp boundaries are covered by `dashboard-flow-parity.spec.ts`. |
| Overview independent dates | Checked | `overview-independent-ranges-parity.spec.ts` covers the four separate date selectors. |
| Cash roles and controlled closing | Checked | `cash-closing-role-access.spec.ts` covers counter and owner boundaries. |
| Expense-to-ledger reconciliation | Test setup repaired | The test now opens the full-screen expense route explicitly and uses the current visible heading. Its temporary Playwright server can remain open after test work on Windows, so its final cleanup needs a separate CI run. |

## Release checks that require the real store environment

The local demo proves the app's screen and local workflow behavior. These checks must be completed once against the intended live deployment before calling a release live:

1. Sign in with each real role and confirm the exact permission matrix.
2. Book one controlled test order and verify its invoice, GST, payment, history, print output, production status, route, delivery, and report row.
3. Run a payment-provider test transaction and confirm the provider webhook, receipt, reversal, and duplicate-submit handling.
4. Print a controlled invoice and garment tag on the physical printer/scanner setup.
5. Validate import preview, rejected-row export, correction, re-upload, and audit trail using a copy of real-format data.
6. Confirm data backup, recovery, monitoring, release rollback, and browser/device coverage.

## User manual

The plain-language operating manual is at [EPIC_LAUNDRY_USER_MANUAL.md](EPIC_LAUNDRY_USER_MANUAL.md). It explains each area, the normal daily path, what every major chart means, and which actions need a final check before saving.
