# MyUniClean parity Phase 11 — Production, garment lifecycle, and quality

**Status: Partial.** This worklog belongs to the current 16-phase parity sequence. The older `PHASE_11_WORKLOG.md` describes a previous reports/statistics tranche.

## Verified in the isolated Epic demo

- The production/quality lifecycle E2E now books three pieces in one synthetic order, advances only one garment through Intake, Sorting, Processing, Quality Control and Rewash, and verifies the two untouched siblings remain at Intake with separate event histories. It also checks duplicate claim feedback, refreshed task metrics, the urgent rewash task, and the associated read-only correction document.
- The role E2E confirms counter staff cannot start or resolve production/quality work (hidden controls plus server 403 responses). Processing staff see the permitted controls; the role check does not commit a claim or task mutation.
- The Returns E2E covers request review and commit, amount and paise validation, cancellation and retry recovery, duplicate handling, register empty/retry states, and separation of requested cases from actual refunds. Returns is recorded as an Epic extension; the supplied MyUniClean route map has no Returns destination.
- The container tracking E2E creates a synthetic 2.5 kg order with two bags. It scans one bag from Intake to Processing, rejects a direct Processing-to-Delivered jump without changing saved state or event history, then records Processing-to-Ready-to-Delivered with the final note. The second bag remains at Intake.
- Quantity checks now prove a three-piece order can advance one garment through Rewash while its two siblings keep independent Intake histories. Multi-container output identifies the 2.5 kg as the order total, leaves individual bag weights unrecorded until measured, and labels printed tags so staff do not mistake the order total for each bag's weight. This corrects the earlier behavior that repeated the total on each container.
- `npm run typecheck`, `npm run test:laundry`, and `npm run test:garment-traceability` pass. The updated `npx playwright test e2e/production-quality-lifecycle.spec.ts` and `npx playwright test e2e/container-tracking.spec.ts` each pass 1/1 with isolated temporary SQLite data; no production order was changed.
- The container scan station, selected-container details, and narrow layout were visually inspected. Evidence: `evidence/container-tracking-station-desktop.png`, `evidence/container-tracking-desktop.png`, and `evidence/container-tracking-mobile.png`.

## Remaining acceptance work

- Extend the quantity check to malformed, fractional and weight-based lines, and cover the remaining valid/invalid garment and container transition matrix.
- Exercise production assignment permissions, additional claim decisions, correction printing, and role combinations across the complete production surface.
- Connect Returns approval/rejection to an explicit permissioned refund settlement and reconcile the resulting payment ledger and reports before implementing that lifecycle.
- Check broader empty, populated, failure, keyboard, theme, and responsive states.
- Compare the matching source workflow when the authenticated MyUniClean browser session is available. The live source browser was not available for this work slice, so source behavior is not claimed as verified.

## Commands and result

- `npm run test:garment-traceability` (server): passed.
- `npx playwright test e2e/container-tracking.spec.ts`: passed 1/1.
- The focused production/quality, role, and Returns regressions were run earlier in this phase sequence and are recorded in the 16-phase roadmap and master parity matrix.
