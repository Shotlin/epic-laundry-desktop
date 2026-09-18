# Transactional Model: Documents, Ledgers, Flows

## 1. Document aggregate anatomy

Every transactional document = header + child tables + posting artifacts:

```
sales_invoice (header: party, dates, currency, totals, status, series name)
├── sales_invoice_item[]      (item, qty, rate, uom, warehouse, tax template, dims)
├── sales_invoice_tax[]       (computed tax rows: type, rate, amount, account)
├── sales_invoice_payment[]   (allocation refs after payment matching)
├── attachments/chatter       (via kernel services, ref_entity+ref_id)
└── on submit → gl_entry[], stock_ledger_entry[] (+ einvoice_artifact, eway_artifact)
```

Status machine (kernel-owned): `draft → submitted → cancelled | amended`; module workflows
overlay approval states *before* submit (e.g. `draft → pending_approval → approved →
submitted`). Post-submit whitelisted fields only (delivery/payment status rollups).

## 2. Document flow graphs (traceability spine)

`document_link` records every from→to derivation with qty/amount mapping at line level:

```
CRM:      lead → opportunity → quotation ┐
SALES:                                    ├→ sales_order → delivery_note → sales_invoice → payment_entry
                                          │                    └→ (return) credit_note ↲
PURCHASE: material_request → rfq → supplier_quotation → purchase_order → purchase_receipt → purchase_invoice → payment_entry
MFG:      production_plan → work_order → job_card → stock_entry(manufacture)
SERVICE:  ticket → service_visit → sales_invoice
```

Line-level linkage powers: partial fulfillment math (ordered vs delivered vs billed vs
paid % on every order), no-orphan rule (cancel blocked while active descendants exist),
and full trace UI ("this payment → these invoices → these deliveries → this batch").

## 3. GL entry (posting schema)

```sql
gl_entry(
  id, tenant_id, company_id, posting_date, fiscal_year,
  account_id, debit NUMERIC(18,6), credit NUMERIC(18,6),
  currency, exchange_rate, debit_fc, credit_fc,
  party_id NULL,                 -- AR/AP subledger dimension
  against_voucher_type/id NULL,  -- invoice-wise outstanding tracking
  voucher_type, voucher_id, voucher_line NULL,
  cost_center_id NULL, dims JSONB,        -- registered dimensions
  is_reversal, reversed_entry_id NULL, remarks
) PARTITION BY RANGE (posting_date)
```

Invariants: balanced per voucher (data-arch §8.3); `against_voucher` allocation rows keep
invoice-wise outstanding computable without scanning payments; reversals reference origins.
Outstanding/aging = materialized read models updated by posting events.

## 4. Stock ledger entry

```sql
stock_ledger_entry(
  id, tenant_id, company_id, posting_datetime,
  item_id, warehouse_id, batch_id NULL, serial_ids [] NULL,
  actual_qty,                    -- signed movement
  qty_after_txn, valuation_rate, stock_value, stock_value_diff,
  incoming_rate NULL,            -- receipt costing (landed-cost adjusted)
  voucher_type, voucher_id, voucher_line,
  is_repost, repost_of NULL
) PARTITION BY RANGE (posting_datetime)
```

Valuation per (item, warehouse): MAvg inline / FIFO via queue table (`stock_fifo_layer`).
Backdated insert → repost job recomputes forward chain + emits GL adjustment entries
(perpetual inventory tie). Batch/serial sub-balances enforced; FEFO pick suggestions read
`batch.expiry_date` indexes.

## 5. Payment & reconciliation model

`payment_entry`: direction, mode (cash/upi/bank/card/cheque with instrument fields), party,
amounts, `payment_allocation[]` (invoice-wise splits incl. TDS-withheld rows, discounts,
write-offs). `bank_transaction` (feed lines) ← matched via `bank_match` (n:m with
payments/invoices/expenses + rule provenance). UPI refs and gateway settlement lines land
as `bank_transaction` children for line-level matching (05-compliance/04).

## 6. Compliance artifacts (linked, immutable)

`einvoice_artifact` (IRN, signed QR/JSON, status timeline), `eway_artifact`, `gst_return`
(period, type, projection snapshot, filed payload hash, filed-vs-books delta ref),
`tds_challan/return`, `payroll_statutory_artifact` (ECR files…). Artifacts are WORM
(arch 03 §6), linked from source documents; cockpit reads artifact + projection tables.

## 7. Read-model catalog (event-maintained projections)

`ar_ap_outstanding` (party × invoice × age bucket), `stock_balance_daily`, `item_velocity`
(reorder AI), `party_payment_behavior`, `gst_liability_running`, `compliance_status`
(cockpit lanes), `kpi_snapshot_daily` (owner dashboards; WA digests read this).
Rebuildable from ledgers at any time (projection versioning; rebuild tooling in ops).

## 8. Worked example (the paranoid trace)

Pharma sale, batch B123: POS invoice submit →
1. `sales_invoice` + items (batch B123 pinned by FEFO)
2. `stock_ledger_entry` (−10 strips, MAvg value out)
3. `gl_entry` × 6 (debtor/cash, sales, output CGST/SGST, COGS, stock)
4. `einvoice_artifact` (B2B case) with IRN QR onto print
5. H1 register row (pack overlay listener)
6. Events: `pos.sale.v1` → loyalty accrual, owner dashboard projector, reorder check
7. Payment UPI → `bank_transaction` (feed) → auto-match → allocation → outstanding zeroed
Every arrow auditable; every row immutable; cancellation reverses 2–3 and voids 4 within
its legal window (else credit note path). This trace is the acceptance test template for
every module (delivery §2 QA doc).
