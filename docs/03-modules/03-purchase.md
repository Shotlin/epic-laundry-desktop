# Module Spec: Purchase

## 1. Job-to-be-done
Buy at the right price from the right vendor, receive what was ordered, pay on time (not
early), and capture every input credit rupee.

## 2. Entities
Documents: `material_request` (indent), `rfq`, `supplier_quotation`, `purchase_order`,
`purchase_receipt` (GRN), `purchase_invoice` (bill), `debit_note`, `landed_cost_voucher`.
Masters: `supplier_group`, `supplier_scorecard`, `approval_matrix` (via workflow engine),
`payment_terms`.

## 3. Core flows
- **Indent→Pay:** material request (auto from reorder rules / manual / production plan) →
  RFQ to N vendors (WA/email with reply portal) → comparison sheet → PO (approval matrix by
  amount/category) → GRN (with QC hook) → bill (3-way match: PO vs GRN vs bill, tolerance
  rules) → payment run.
- **Bill-first reality:** photo/PDF of bill → AI extraction (A1) → matched to PO/GRN or
  standalone expense bill → GST fields verified against 2B later (compliance module).
- **Returns/shortage:** debit notes with stock + tax linkage.
- **Landed costs:** freight/customs/insurance allocated to item valuation (import flow).

## 4. Feature ladder
- **MVP:** PO, GRN, bill capture with AI extraction, 2-way match, payables aging, payment
  entries, debit notes, supplier ledger + statement.
- **v1:** material requests, RFQ + comparison, 3-way match with tolerances, approval
  matrices, landed cost, TDS on vendor payments (194C/194J/194Q etc. via compliance engine),
  RCM flagging, payment runs (batch UPI/NEFT via payout connectors), vendor portal.
- **v2:** supplier scorecards (OTIF, quality, price variance), blanket POs/rate contracts,
  auto-PO from reorder + seasonality forecast (A7), import module (BoE, customs duty, forex).

## 5. Ugly cases
Bill arrives before GRN / GRN before bill / neither matches PO; vendor bills with wrong GSTIN
or wrong tax rate (block ITC risk — warn at entry); partial GRN across months with price
revision in between; MSME vendor 45-day payment rule (Section 43B(h)) breach warnings;
unregistered vendor RCM; advance to vendor with TDS; multi-vendor freight on one shipment.

## 6. India notes
**ITC is profit:** every purchase screen surfaces input-credit status. MSME payment-timeline
compliance (43B(h)) is a board-level fear — build the aging alarm natively. Vendor onboarding
collects GSTIN/PAN/MSME-Udyam/bank proof with verification APIs. Mandi/agri purchases:
cash-limit warnings (Section 40A(3)).

## 7. AI assists
A1 bill extraction, duplicate-bill detection (A9), price-variance flags vs history,
vendor-reply parsing into quotation comparison.

## 8. KPIs
Payables aging, upcoming payment runs, ITC at risk (unmatched 2B), purchase price variance,
OTIF by vendor, open indents/POs, MSME 43B(h) exposure.
