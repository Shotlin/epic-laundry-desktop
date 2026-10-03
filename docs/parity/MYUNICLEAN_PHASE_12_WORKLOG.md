# MyUniClean parity Phase 12 — Pickup, delivery, routes, and riders

**Status: Partial.** This worklog belongs to the current 16-phase parity sequence. The older `PHASE_12_WORKLOG.md` describes a prior UI hardening, migration, and packaging tranche.

## Local Epic walkthrough

- The Route Control UI was exercised in Playwright's isolated demo workspace with two synthetic pickup orders and a synthetic rider assignment.
- The test selects Pickup, chooses a captain and service zone, sets route time/cadence, selects both customer/order cards, and creates a two-stop route.
- It starts the planned run, expands its stops, completes one pickup, and records a required reason for skipping the other. Complete and Skip now have visible text alongside their icons, including at the 390 px viewport.
- Read-after-write checks confirm the run closes with one Completed and one Skipped stop, the completed order advances from Booked to Picked Up, and the skipped order remains Booked. The skip reason is retained in the route stop history.
- A second isolated UI test prepares one Home Delivery order by scanning its garment through Processing → QC → Assembly → Racked and moving the order to Ready. It assigns the rider, creates and starts a Delivery run, verifies Ready → Out for Delivery on dispatch, then completes the stop and verifies Delivered plus a Completed route record.
- The 390 px page width does not overflow. Desktop and mobile screenshots are saved in `evidence/route-control-plan-desktop.png`, `evidence/route-control-run-desktop.png`, and `evidence/route-control-run-mobile.png`; both active-run screenshots were inspected.
- The Delivery run desktop state is captured at `evidence/route-control-delivery-desktop.png`.
- `npm run test:routes` (server): passed; `npx playwright test e2e/route-control.spec.ts`: passed 2/2.

## Remaining acceptance work

- Reopen the live MyUniClean reference to compare its pickup assignment, delivery assignment, rider, and report controls one by one. Source behavior is not asserted from the older read-only audit because those route-control interactions were not mapped there.
- Reconcile the verified order transitions and route/stop history with Pickup Overview, Rider Delivery, Rider Collection, order history, fulfilment history, finance, and customer/order views.
- Verify delivery evidence, OTP, signatures, address/phone visibility, errors, offline recovery, all screen widths, and themes. These capabilities are absent or unresolved and must not be represented as implemented.
- Decide whether completed routes need an on-screen history entry point; this test verifies durable API history after a completed run, while the live Route Control board displays active runs.

All test writes stayed in Playwright's temporary SQLite workspace. No connected vendor workspace, live MyUniClean record, or production order was changed.

## Phase 12 continuation — rider access and handoff feedback (1 October 2026)

- Added browser coverage for a linked rider, a second rider, and an unlinked rider. A linked rider sees only their route, starts it, completes its pickup stop, and gets visible status feedback; the owner view confirms the order advanced to Picked Up.
- Cross-rider attempts to start another rider's route or complete its stop return HTTP 403. An unlinked rider sees the explicit not-linked message and no route runs. The rider's direct order-detail request returns 403, confirming the limited assigned-work access boundary.
- Server route errors for cross-rider start/complete now use 403. Rider actions expose a visible success message; denied actions have accessible error feedback. Route Control waits for the role query before requesting owner-only dispatch data, preventing a transient forbidden request while a rider session loads.
- `npx playwright test e2e/rider-route-access.spec.ts --reporter=line` passed 1/1 against Playwright's temporary SQLite database; the web production build passed.
- The test explicitly reloads after switching sessions because changing only the HashRouter fragment preserves the old React Query session cache. No live reference or production records were changed.

Phase 12 remains Partial: MyUniClean route interactions still need live comparison; report, finance and fulfilment reconciliation; completed-run discoverability; handoff proof; and offline, theme, error and responsive coverage remain open.
