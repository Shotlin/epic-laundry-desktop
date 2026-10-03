# MyUniClean parity Phase 10 — Store Orders and order detail

Status: **Partial**. This is the current 16-phase parity sequence; the older
[`PHASE_10_WORKLOG.md`](PHASE_10_WORKLOG.md) is an implementation-tranche record
for expenses and communication.

## Review and confirmed gap

- Reviewed Epic's Store Orders, work card, direct order-detail page, and shared
  Order & Billing edit route in the isolated local demo.
- The saved order detail showed charge and discount totals but did not retain
  the selected rule labels. The client already had a labelled price-breakdown
  type for the connected service, while the local quote and order API omitted
  it.
- A fresh authenticated, read-only source check opened Store Orders and its
  More Filters panel. The populated grid showed the documented invoice,
  customer, phone, order date, delivery date, amount, source, status, and
  action columns. The date controls were disabled by default. No filter value,
  row action, status action, export, or order was changed.

## Changes made

- The local server quote now returns named charge, discount, and GST detail
  lines alongside the existing totals. Percentage rules retain their selected
  percentage and applied amount; manual charge/discount values get clear
  labels.
- Booking and controlled edits save the breakdown with the order. Opening an
  order returns that saved snapshot, so later catalogue rule edits do not
  rewrite historical labels or amounts.
- Older orders without a saved breakdown receive readable fallback labels
  derived from their existing saved totals.
- Order detail now displays the named pricing lines under the saved amount
  summary. The shared formatter includes percentages for percentage-based
  charges and discounts.
- The quote formula, tax policy, and 18% GST default/dropdown behavior were not
  changed.

## Verification

- `server: npm run typecheck` — passed.
- `server: npm run test:catalogue` — passed; the added case books an order with
  configured charge/discount rules, then changes those master rules and proves
  the reopened order keeps the saved labels and totals.
- `webapp: npm run build` — passed.
- `webapp: npx playwright test e2e/order-history.spec.ts -g "labels saved charge"`
  — passed (1/1); the focused UI check used a read-only response fixture and
  confirmed the rule names, percentages, amounts, and zero order writes.
- `webapp: npx playwright test e2e/order-history.spec.ts` — passed (9/9)
  before the added regressions. Focused stale-version, full-page Excel
  export/retry, list/grid, bulk status, and page-size/pagination checks each
  passed (1/1). The Excel test parses the generated `.xlsx` and checks all 101
  filtered rows over two pages after recovering from a 503 page read. Bulk
  confirmation checks Cancel sends zero writes and sequential expected-version
  requests for Done and Delivered.
  A new stale-version case opened a synthetic order in Edit Mode, simulated a
  concurrent saved amendment, then confirmed the editor's outdated save was
  rejected, the newer invoice and note remained persisted, and the unsaved
  editor draft stayed available. This uses the disposable Playwright database.
- Desktop and 390 px mobile screenshots were inspected. The price details fit
  without horizontal overflow:
  `evidence/order-price-breakdown-desktop.png` and
  `evidence/order-price-breakdown-mobile.png`.
- The local browser tests use Playwright's temporary SQLite database. No
  MyUniClean or production record was changed.
- An expanded full-file run initially passed 12 of 13 tests before Windows
  returned `ENOSPC` while writing the invalid-date screenshot. After machine
  storage recovered, the complete `order-history.spec.ts` rerun passed 14/14,
  including page-size navigation, export, grid, bulk, and stale-version checks.

## Remaining Phase 10 work

- The broader order-history, pricing, customer, and role regression group is
  passed 15/15; the server laundry regression self-test also passed.
- Stale-version amendment protection now has a focused isolated browser check;
  confirm whether the source also surfaces a recovery action after this conflict
  when its authenticated workspace is available.
- Compare export rows and remaining filter result sets with the live source;
  verify API 403/404 contracts, complete role coverage, audit history, and
  cross-module reconciliation. Local Excel all-pages/retry behavior,
  list/grid rendering, page-size navigation, and confirmed bulk status changes
  now have focused coverage.
- Compare the equivalent MyUniClean order controls, remaining status choices,
  and the date-enable rule in further read-only source checks.

The named pricing detail gap is implemented locally; Phase 10 remains Partial
until its other acceptance checks pass.
