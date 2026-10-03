# MyUniClean parity — Phase 16: integrated manual QA and launch readiness

**Status: Partial.** This is the local acceptance record for the latest slice, not a launch sign-off or a claim of complete parity.

## 2 October 2026 release verification

- The full isolated Playwright suite passed **119/119** in 16 minutes. Coverage
  includes dashboard shortcuts, booking/GST choice, customers, orders/history,
  production and garment traceability, delivery routes, cash/wallet/expense
  reconciliation, report families and exports, permissions, navigation,
  settings, offline recovery, keyboard focus, dark theme, phone widths, and
  accessible button names. It used a disposable SQLite database and did not
  write to the installed user's database or MyUniClean.
- `webapp: npm run build` passed TypeScript and the normal minified Vite build;
  `server: npm run typecheck` and the packaged server build passed.
- `desktop: npm run pack` and `desktop: npm run dist:win` passed. Windows NSIS
  setup and portable executables were generated under `desktop/dist`; the
  release manifest verifies all 3,866 checksums.
- Both Windows executables are **NotSigned**. `desktop: npm run
  assert:production-release` correctly blocks a production release because the
  approved release confirmation/version, Authenticode certificate/password,
  Ed25519 manifest key pair, and HTTPS update feed are not configured. The
  manifest is explicitly `internal-unsigned`; these artifacts are for internal
  QA, not a signed customer release.

## Local checks completed

- Latest production frontend build: `webapp npm run build` — passed (`tsc -b` and minified Vite production build); Windows packaging rebuilt it successfully too.
- Fresh isolated Playwright regression: **22/22 passed** across dashboard, booking GST selection, Store Orders, container tracking, route control, payment reconciliation and sidebar navigation.
- Report contract suite: **16/16 passed**, plus the filtered Collection Report export contract **1/1 passed**.
- Operations hub route E2E: **1/1 passed**. Desktop and 390 px Operations hub screenshots were inspected.
- The grouped regression confirms the GST selector defaults to the existing `GST (18%)` rule, allows supported selections, displays the selected value, and refreshes the existing server quote. The GST-disabled store has no GST rate choice. No GST calculation or rate formula was changed in this slice.
- The sidebar cleanup is present in the fresh production build: Captain settlements appears once in the rail under Finance & compliance, and all 34 current destination links reach their declared routes.
- A continuous synthetic Playwright journey now passes **1/1**: Dashboard → New Order with the configured GST (18%) selector → add customer → Book Order → Store Orders/history/summary → production task starts and garment scans → Ready → delivery route create/start/complete → full UPI collection → Collection Report. It also confirms the order, payment summary, and collection report show the same canonical invoice number.
- The related payment/reversal browser flow passes **1/1**, including an order dated yesterday and a collection posted today. The report finds the linked order and displays its canonical invoice number consistently. All journey screenshots were captured under `docs/parity/evidence/integrated-daily-workflow-*.png`.
- The audit uncovered two usability/data-consistency gaps and fixed them: payment summaries and Collection Report now use the canonical invoice number already shown on the order; completing the final route stop now announces a clear, accessible run status before the completed route leaves the live board.
- Browser tests use a newly created temporary SQLite database with demo mode and no production vendor connection. Source MyUniClean data was not changed.
- The newest focused Settings/Catalogue regression passes **2/2**: it verifies distinct Garment Pricing and Garments deep links, announced/focused target sections, price filters and pagination, Category display, and zero catalogue writes.
- The price-matrix fixture includes legacy uppercase/underscore service labels;
  its filter and paging E2E passed in the full 119-test run.
- Latest catalogue follow-up: Categories and Services E2E passed **4/4** on the
  rebuilt bundle, including case/space duplicate rejection, search counts,
  empty-result pagination hiding and reversible status behavior. Service Units
  E2E passed **2/2**, including its source-shaped 12-row paging case. Store
  Charges and Store Discounts paging passed **1/1** across both 12-row lists.
  These tests used intercepted catalogue writes or no writes.
- `npx tsc -b`, the default minified Vite build, and the Windows runtime/package
  build all pass after the latest UI changes.

## Source and launch boundary

The user authenticated the MyUniClean tab directly. A fresh read-only check opened Order & Billing and Store Orders. It confirmed the two visible GST option sets (`None` / `GST (18%)` and a separate `Including GST` / `Without GST` mode) without selecting either or booking an order. It also confirmed the Store Orders populated-table shape and the disabled-by-default date controls in More Filters. No source record, filter value, row action, export, or order was changed.

During the 2 October continuation, read-only Settings checks inspected Service
Units, Store Charges, and Store Discounts. Add/Edit drafts were canceled; row
delete controls were not activated. The MyUniClean session expired when opening
Garment Pricing and redirected to Sign In, so no new price-row/status evidence
was collected in this run. No credentials were entered and no source data was
changed.

The local automated acceptance suite and unsigned package build now pass. The
live source comparison remains incomplete: the MyUniClean tab expired to Sign
In when Garment Pricing was opened, so its remaining route/control semantics
need a fresh read-only authenticated session. Connected vendor persistence is
not certified by local-demo tests. The generated installers are unsigned, and
no installer was run against the user's installed data.

## Remaining acceptance work

1. Verify connected-vendor persistence and retry paths with an authorized
   non-production vendor account.
2. Configure the approved release version, Authenticode credentials, Ed25519
   manifest keys, and HTTPS update feed; then rerun the guarded signed-release
   build and signature verification.
3. Install and manually review the generated package in an isolated test
   profile before a customer release. Do not point an unsigned package at
   existing user data as part of this audit.

See the [16-phase roadmap](../myuniclean-16-phase-execution-roadmap.md), [master parity matrix](MASTER_PARITY_MATRIX.md), and [known verification gaps](NEEDS_VERIFICATION.md).

## 3 October 2026 close-out verification

- The restored MyUniClean session completed the previously interrupted,
  read-only Settings comparison. Garment Pricing, Store Discounts, WhatsApp
  Message Templates, Store Users, Store Packages, and Order No Series were
  opened. This store has empty lists in each of these screens. No MyUniClean
  record, source filter, export, template, setting, or order was changed.
- The focused Epic suite passed **8/8**:
  Catalogue Pricing, Store Discounts, Message Templates, Settings navigation,
  Store Packages, Store Users (two cases), and Order No Series. It uses the
  disposable Playwright database.
- `server npm run typecheck`, `test:catalogue`,
  `test:marketplace-cloud-catalogue`, and
  `test:marketplace-cloud-client` all passed. The latter verifies connector
  configuration, mocked OTP exchange, encrypted token storage and transparent
  retry; it does not claim a live vendor account was contacted.
- The normal minified frontend build passed. Desktop workspace isolation,
  cloud configuration, menu routing, recovery-policy and 3,866-entry manifest
  verification all passed.

The source-comparison block is now complete for the live views available in
this account. Phase 16 remains Partial only for actions that require external
resources not present in this workspace: an authorized non-production vendor
account for remote persistence/retry, and release signing/update-feed
credentials for a customer distribution. The unsigned QA package was not
installed over existing user data.
