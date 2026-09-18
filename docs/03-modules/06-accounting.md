# Module Spec: Accounting (the load-bearing wall)

## 1. Job-to-be-done
Owner: "kitna kamaya, kitna aayega, kitna dena hai — bina CA ko call kiye."
CA: a books-of-account system that survives audit and files itself.

## 2. Entities
Masters: `account` (CoA tree; India templates per entity type), `cost_center` (tree),
`fiscal_year`, `tax_template` (GST/TDS built by compliance module), `bank_account`,
`currency` + rates, `budget`.
Documents: `journal_entry`, `payment_entry` (receive/pay/internal transfer, multi-invoice
allocation, advances), `expense_claim` (via expenses), `period_closing_voucher`,
`exchange_revaluation`, `deferred_schedule` (revenue/expense).
Ledger: `gl_entry` (append-only; account, debit, credit, party, cost_center, against, ref).

## 3. Posting architecture
All modules post through the Posting Engine (platform-core §2): sales/purchase/stock/payroll/
assets emit GL entries via accounting rules (item-group → income/expense account maps,
warehouse → stock account, tax rows → tax liability accounts). Accountants see voucher-level
detail with drill-to-source; nothing enters GL without a source document. Perpetual inventory
accounting default-on (stock ↔ GL always tied).

## 4. Core capabilities
- **Books:** double-entry GL, sub-ledgers (AR/AP by party), multi-currency (transaction +
  reporting currency, revaluation), cost centers + dimensions (project, branch — dimension
  framework lets packs add e.g. "vehicle", "site"), inter-company journals.
- **Banking:** feeds (account-aggregator/statement import), **reconciliation workbench**
  (Odoo S10 pattern: suggestions, one-key match, rules that learn), UPI collection
  auto-match (VPA/QR reference), payout files/API (NEFT/RTGS/IMPS batches), cheque printing
  + PDC management (post-dated cheque calendar — Indian credit reality).
- **Receivables/Payables:** aging, statements, reminder ladders, advance handling, TDS
  deducted-by-customer tracking (26AS-style reconciliation), write-offs with approvals.
- **Closing:** period locks per module, closing checklist (depreciation run, deferred
  schedules, forex reval, stock-GL tie-out report, GST/TDS control-account reconciliation),
  year-end closing voucher, opening balance migration tooling.
- **Statements:** Trial Balance, P&L, Balance Sheet, Cash Flow (indirect), by
  company/branch/cost-center/consolidated (paid tier), Schedule III export formats,
  ratio dashboard (current ratio, DSCR, margins).

## 5. Feature ladder
- **MVP:** CoA templates, GL + all core vouchers, bank statement import + manual recon,
  AR/AP aging, TB/P&L/BS, period locks, GST-ready posting (via compliance).
- **v1:** reconciliation workbench + rules, UPI auto-recon, cost centers/dimensions,
  multi-currency, deferred rev/exp, budgets with commitment tracking, PDC, payment runs,
  closing checklist, auditor workspace (read-only + working-paper exports + audit-trail
  reports for MCA rule).
- **v2:** multi-company consolidation with eliminations, cash-flow forecasting (A5),
  IndAS-lite report presets, cost allocations (rule-based overhead spreading), treasury
  (FD/loan schedules, interest accruals).

## 6. Ugly cases
Backdated entry after GST return filed (warn + track as "books vs return" diff); payment
received for 14 invoices minus random ₹1,73,502 TDS and ₹500 bank charges (allocation UX);
rounding (invoice-level rounding account, paise discipline); cheque bounce reversal chains;
foreign advance + invoice at different rates; GST on advances (services); year-end stock in
transit; dimension backfill on old entries (blocked; report-level mapping instead);
Tally opening migration with ledger-level vs bill-wise balances.

## 7. India notes
**MCA audit trail (Companies Act):** edit-log requirement satisfied structurally (immutability
+ kernel audit log — arch 05). Books retention 8 years. Schedule III statement formats,
CARO-support reports, 43B(h) MSME disclosure, Section 40A(3) cash-payment caps (warnings),
269SS/269T cash loan limits (warnings). Interest on late payments culture → auto interest
notes optional.

## 8. AI assists
A1 (bill/receipt → JE draft), A2 (recon matching), A4 (NL reports: "is quarter ka profit
branch-wise"), A5 (13-week cash forecast), A9 (duplicate/round-tripping anomalies).

## 9. KPIs (owner home defaults)
Cash + bank today, receivables (with "collect today" list), payables due 7 days, MTD
sales/expense/profit, GST payable estimate, runway (if loss-making).
