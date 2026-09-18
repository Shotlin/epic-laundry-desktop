# Module Spec: Sales

## 1. Job-to-be-done
Quote fast, bill correctly (GST-perfect every time), get paid faster (UPI on every invoice),
and never lose track of who owes what.

## 2. Entities
Documents: `quotation`, `sales_order`, `delivery_note`, `sales_invoice`, `credit_note`,
`payment_entry` (shared with accounting), `pro_forma`. Masters: `price_list`,
`pricing_rule` (qty slabs, customer group, campaign), `payment_terms`, `sales_person`,
`commission_rule`, `credit_limit_policy`.

## 3. Core flows
- **Quote→Cash:** quotation (versioned, validity, margin-visible-to-manager-only) → SO
  (stock reservation optional) → delivery note (partial allowed) → invoice (auto e-invoice
  when applicable) → payment (UPI QR / link / bank) → auto-reconciliation.
- **Direct invoice:** counter-sale path skips quote/SO (micro-segment default).
- **Returns:** credit note against invoice with stock return + e-invoice CN handling.
- **Receivables:** aging buckets, statement-of-account share (PDF/WA), reminder ladders
  (gentle→firm, vernacular templates), promise-to-pay tracking, dunning pause per customer.

## 4. Feature ladder
- **MVP:** quotations, invoices (B2B/B2C, GST-complete: place-of-supply, HSN, cess, RCM,
  export/SEZ/LUT), credit notes, UPI QR on print/PDF/WA, payment recording, receivables
  dashboard, PDF/WA share, price lists.
- **v1:** sales orders + partial fulfillment, pricing rules engine, credit limits with
  override approvals, commissions, delivery notes, recurring invoices, multi-currency
  invoicing, TCS on sales, customer portal (view/pay invoices).
- **v2:** blanket orders/rate contracts, proposal builder (sections, images, e-sign),
  margin analytics, promotions engine (tie to loyalty), backorder automation.

## 5. Ugly cases
Partial delivery + partial payment + partial return of the same order; invoice raised then
e-invoice IRN fails (queue + retry + legal fallback rules); customer merges/GSTIN change
mid-order; rate inclusive-of-tax pricing (B2C habit) vs exclusive (B2B) on the same item;
free-quantity schemes (10+1) hitting GST valuation rules; advance received (GST on advance
for services); credit note spanning two fiscal years; e-invoice within 30-day IRP window
(FY26 rule) for late-entered invoices — hard validation.

## 6. India notes
Invoice = legal artifact: series discipline, signature/DSC options, IRN + QR zone, declaration
lines, transporter details for e-way handoff. Pro-forma culture is strong (advance-payment
businesses). "Bill to / Ship to" GST place-of-supply logic must be bulletproof.
Kachha/pakka bill reality: we never facilitate evasion; we make compliant billing cheaper than
the alternative (UPI reconciliation + input credit visibility as carrots).

## 7. AI assists
A1 (voice/photo → draft invoice), A5 (collection prioritization: "call these 5 today"),
payment-date prediction per customer, price suggestion from history.

## 8. KPIs
Daily/MTD sales vs target, gross margin %, DSO, aging waterfall, top customers/items,
quote win rate, avg payment delay by customer.
