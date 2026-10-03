# Booking discount and weight fix — 3 October 2026

## Reported behavior

The booking screen displayed Mixed clothes quantity `0.1`, rate `₹50`, and total `₹5` without explaining the kilogram unit. Booking with a configured charge and larger discount failed with `invoice line N rate cannot be negative`.

## Cause and repair

The arithmetic was correct: 0.1 kg × ₹50/kg = ₹5. The first Add click used the kilogram increment (0.1) as its initial quantity. Add now starts at 1 kg; explicit fractional weights remain available. The selected list shows the unit, unit price and multiplication. Its footer groups quantities by unit instead of adding pieces and weight into a misleading item count.

The legacy invoice expresses the net charge/discount as a signed `LAUNDRY-ADJUSTMENT` line. Canonical snapshots previously parsed that line as a non-negative unit price. The bridge now recognizes only that specific legacy adjustment and allocates its discount across service lines with matching classification and tax rate. Integer-paise allocation preserves the exact amount and prevents discounted line values falling below zero. Actual negative garment prices remain rejected.

The bridge accepts only bounded per-line tax rounding differences when the taxable value matches the posted invoice exactly. Larger discrepancies still fail reconciliation. Garment units are now carried into invoice input and immutable evidence.

## Verification

- Regression reproduced the reported negative-rate error before the repair.
- `npm run test:booking-discount`: passed seven configured/custom adjustment scenarios, fractional weight, small rounding amounts, near-full discount, correct invoice units, matching receipt/ledger/snapshot totals, and actual negative-price rejection.
- `npm run test:invoice-snapshot`: passed.
- `npm run test:laundry`: passed.
- Server type check and frontend production build: passed.
- Browser regression assertions ran against disposable sample data: 0.1 kg at ₹50/kg, a ₹640 piece, configured Express charge and Welcome discount, HTTP 201 booking, matching ₹748.71 quote/receipt, and visible Order booked confirmation. The Playwright test runner did not exit; the same assertions were executed directly with Playwright, which completed successfully.
- The port-3002 local server was restarted using the existing sample workspace launcher so the fix is active locally.

No live MyUniClean write or real payment-provider transaction was performed.
