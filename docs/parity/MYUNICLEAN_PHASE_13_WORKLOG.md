# MyUniClean parity — Phase 13: finance and payment operations

**Status: Partial.** This worklog records Epic's isolated-demo evidence and the remaining acceptance boundary. The authenticated MyUniClean reference was not available for fresh page-by-page comparison in this slice.

## Requirement

Keep financial writes explicit and auditable. Verify that collection dates are not confused with order dates, and that order balances, collection reports and canonical ledger entries agree. This work does not change the GST rate, tax formula, payment provider, or finance policy.

## Synthetic end-to-end flow exercised

`webapp/e2e/payment-collection-flow.spec.ts` creates a Pay Later order whose order date is the previous business day, using the existing GST configuration. It then:

1. Confirms the new order is Unpaid and its full amount is outstanding.
2. Records a partial UPI payment in the Store Orders work card with a reference and note, through the explicit Record collection action.
3. Confirms the order becomes Part Paid, the paid/outstanding amounts update, the collection uses today's posting date, and the order date remains yesterday.
4. Confirms the Collection Report matches the receipt by date, method, and reference, and that the visible table shows the payment rather than the order date.
5. Reverses the receipt with a required reason, confirms the order returns to Unpaid, and checks immutable canonical entries for collection-in and refund-out.
6. Confirms the reversed receipt is excluded from the active Collection Report.

Every write ran in Playwright's temporary SQLite database. The test did not call a real payment provider or touch a live store.

## Cash shift close flow exercised

`webapp/e2e/cash-closing-flow.spec.ts` uses a synthetic Pay Later order and an owner session to verify the cash register from opening through close:

1. Opens a named shift with a starting float in the cash-closing workspace.
2. Records a full Cash collection through the Store Orders work card and verifies the collection is attached to the open register.
3. Confirms expected cash equals starting float plus the cash receipt and that collection count is correct.
4. Closes with the matching physical count; the UI and `cash-close-drill` agree on a zero variance and fixed-paise reconciliation.
5. Starts a new shift using the same register name and confirms it receives a new shift identity.
6. Attempts a mismatched count without a reason; the UI explains the missing variance note and the server leaves the shift open.
7. Adds the reason and closes with variance approval attribution recorded against the nonzero variance.

The browser test passed 1/1. Its read-after-write assertions verify that the visible cash-closing page shows the received amount, updated expected drawer total, and collection count before close. That check found a stale query after a cash collection; Store Orders now invalidates cash-shift, closed-shift, and close-drill queries after collection or reversal, and booking does so after a Cash order. The refreshed screenshot shows the expected amount and one collection entry. Four screenshots capture the open shift, matching count, variance review, and approved variance. All writes used Playwright's temporary SQLite database.

## Care package payment and cash reconciliation

`webapp/e2e/care-package-flow.spec.ts` exercises the full synthetic package path: owner creates a two-use garment/service package, searches and selects a customer, assigns it on account, collects ₹75 Cash to the explicitly selected register while two registers are open, collects the ₹175 balance by UPI, redeems both included units, and closes the cash shift with the expected count.

The UI flow found three connected gaps. First, package cash receipts were absent from cash shift collection totals and the normalized close drill. Second, after collecting payments against an on-account package, the customer package projection could count the aggregate paid amount and immutable receipts twice. Third, the package customer picker showed only the first 30 customers without a search field. Package receipts now carry their shift identity; cash close and reconciliation include each cash receipt once; package liability uses the immutable initial receipt plus later payment rows; and staff can search customers by name or phone before assigning or redeeming.

The browser asserts the package shows exactly ₹250 collected and no outstanding balance after Cash + UPI; the two uses reach Exhausted; only the selected register receives ₹75; the drawer expects ₹115 from a ₹40 float; and the cash close drill passes. It also forces the first register lookup to fail and verifies the visible Retry control recovers the register selector. Screenshots: `evidence/care-package-flow.png` and `evidence/care-package-cash-close.png`. The API package self-test also covers a fully paid cash package, an initial partial cash deposit, a follow-up cash receipt and a non-cash receipt in one reconciled shift. All test writes use Playwright's temporary SQLite database.

## LNDRY wallet tender and order reconciliation

`webapp/e2e/wallet-finance-reconciliation.spec.ts` creates a fresh synthetic customer and intercepts the browser's LNDRY wallet lookup, redemption-request, and OTP-confirm endpoints with fixed test responses. It checks the order and collection APIs receive no writes before the operator presses Book order, and the approved wallet amount is shown as reserved until that commit.

After booking, it verifies that the receipt, order, and payment summary all show Part Paid; the submitted LNDRY Wallet payment carries the redemption reference; the customer ledger records the full invoice debit and matching wallet credit; the customer order balance and Balance Report show the same remainder; and the store's separate wallet balance remains unchanged. It then collects the balance through the Store Orders work card by UPI and checks the order and customer balance reach Paid/zero, the Balance Report row disappears, the Collection Report contains both wallet and UPI tenders, and the immutable wallet collection entry is exactly 1,735 paise.

The first end-to-end run exposed a status mismatch: a wallet-paid partial order was being stored as Unpaid even though the payment summary and ledger contained the partial receipt. Booking now derives the initial order status from the payment legs actually recorded, so partial wallet + Pay Later begins as Part Paid. All writes remain in Playwright's temporary SQLite database; wallet-provider endpoints are mocked and no live LNDRY or payment-provider call is made. Evidence: `evidence/wallet-finance-reconciliation.png`.

## Payment-link preparation and staff boundaries

`webapp/e2e/payment-link-safe-boundary.spec.ts` selects a fresh synthetic customer and priced garment, requests the current quote, chooses UPI, and prepares a link. It verifies the UPI intent amount and request body match the quote, the customer name appears in the description, and the visible message says preparation/copying does not mark an order paid. No order/payment write or external provider request occurs, and the customer still has no orders or balance. The API rejects zero and excess-decimal amounts. The link endpoint now requires `payments.collect`, so it cannot be used by roles that lack collection permission.

`webapp/e2e/cash-closing-role-access.spec.ts` verifies counter staff can prepare a payment link and perform matching cash closes; a nonzero variance leaves the shift open until owner review; owner approval is attributed to the owner; and processing staff are denied cash routes and endpoints as well as payment-link creation. It also checks the cash-closing page has no horizontal overflow at 390px. Test data is isolated in temporary SQLite.

These checks cover local link preparation and route authorization only. They do not establish that a customer paid, or verify provider callback, settlement, cancellation, or refund behavior.

## Expense, report, and drawer reconciliation

`webapp/e2e/expense-finance-reconciliation.spec.ts` opens a synthetic ₹1,000 cash shift, records a ₹137.45 utility expense through the Add Expense form, and reconciles the same entry through the filtered Store Expense ledger, Expense Report aggregate and daily row, and cash drawer. The visible drawer must show one cash expense of ₹137.45 and an expected balance of ₹862.55 before the matching count can close it. The first visual check found the API totals were right while the cash page still showed zero after leaving and returning; expense create/edit/cancel now invalidate the active shift, closed-shift history and close drill. The same test found finance reports rounded paise away, so expense and report money displays now retain the exact amount. Evidence: `evidence/expense-finance-report.png` and `evidence/expense-finance-cash-close.png`.

## Verification

- `webapp`: `npx playwright test e2e/payment-collection-flow.spec.ts` — **1/1 passed**.
- `server`: `npm run test:payment` — passed.
- `server`: `npm run test:reconciliation` — passed.
- `server`: `npm run test:cash-shift` — passed.
- `server`: `npm run test:money` — passed.
- `server`: `npm run test:financial-normalization` — passed.
- `webapp`: `npm run test:e2e -- e2e/cash-closing-flow.spec.ts` — **1/1 passed**.
- `webapp`: `npx playwright test e2e/care-package-flow.spec.ts` — **1/1 passed**.
- `webapp`: `npx playwright test e2e/wallet-finance-reconciliation.spec.ts --reporter=line` — **1/1 passed**; wallet endpoints intercepted, synthetic local customer/order only.
- `webapp`: `npx playwright test e2e/payment-link-safe-boundary.spec.ts --reporter=line` — **1/1 passed**; link preparation only, no provider call or order/payment write.
- `webapp`: `npx playwright test e2e/cash-closing-role-access.spec.ts --reporter=line` — **1/1 passed**; counter, owner, and processing role boundaries.
- `webapp`: `npx playwright test e2e/expense-finance-reconciliation.spec.ts --reporter=line` — **1/1 passed**; expense ledger/report/drawer values agree to paise.
- `server`: `npm run test:package`, `npm run test:cash-shift`, and `npm run test:reconciliation` — passed after package cash allocation changes.
- `server`: `npm run typecheck` — passed.
- `webapp`: `npm run build` — passed.
- `git diff --check` — passed; only pre-existing line-ending conversion warnings were emitted.
- The UI evidence capture `evidence/payment-collection-ledger-desktop.png` was visually inspected.

## Remaining work before Complete

- Verify the connected provider's actual reservation/cancel/expiry and settlement behavior with an authorized test account; the local wallet tender/order/customer/report reconciliation now passes with synthetic provider responses.
- Verify payment-link provider settlement, callbacks, cancellation, and payment matching only with an authorized test provider/account; retain manual-safe status until provider confirmation.
- Verify any cash-close correction/reopen policy beyond starting a new shift for the same register, and audit additional staff roles beyond owner/counter/processing.
- Extend cross-module reconciliation to one combined dataset spanning expense, customer/order balance, collection, refund and the wider finance reports; the expense-report and drawer slice now agrees to paise.
- Verify finance roles, read/write failure recovery, keyboard/mobile/themes, and current MyUniClean interaction parity when its authenticated browser is available.
- Package expiry policy, package report semantics, and the MyUniClean package lifecycle remain unverified against the live source.

See the [master parity matrix](MASTER_PARITY_MATRIX.md), [known verification gaps](NEEDS_VERIFICATION.md), and [16-phase roadmap](../myuniclean-16-phase-execution-roadmap.md) for the current phase boundary.
