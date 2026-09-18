# Banking & Payments Rails (India-native money movement)

## 1. Collections (getting paid — the growth feature disguised as plumbing)

- **UPI:** dynamic QR per invoice (amount+ref embedded) on every print/PDF/WA share;
  UPI links; soundbox/terminal integrations at POS; **auto-reconciliation** by transaction
  ref → invoice (the killer loop: invoice → QR → paid → matched, zero clicks).
- **Payment gateways:** Razorpay/PayU/Cashfree connectors (cards/netbanking/UPI/EMI),
  payment pages per invoice, settlement-file reconciliation (gross vs fees vs GST-on-fees
  posting — automated).
- **E-mandates for recurring:** UPI Autopay + e-NACH registration flows (subscriptions
  module), mandate lifecycle (create/pause/cancel), failure dunning ladders, tier caps as
  data (₹15k Autopay sans-AFA tier etc.).
- **Payment behavior ledger:** per customer — promised vs paid dates feeding collection AI
  (A5) and credit-limit suggestions.

## 2. Payouts (paying out without portal-hopping)

Payout connectors (RazorpayX/Cashfree Payouts/bank corporate APIs): vendor payment runs,
salary batches, reimbursements — maker-checker mandatory (arch 05 §5), penny-drop account
verification at vendor/employee onboarding, IMPS/NEFT/RTGS/UPI mode selection by amount/
urgency rules, bank-file export fallback (each bank's csv/txt formats as templates) for
non-API tenants.

## 3. Bank feeds & reconciliation

- **Account Aggregator (AA) framework** connectors (consent-based feed pull — Sahamati
  ecosystem) as the strategic rail; statement import (PDF/xlsx/csv parsers per major bank,
  AI-assisted for odd formats) as the universal fallback.
- Reconciliation workbench (accounting §4): rules learn per tenant (narration patterns →
  ledger mapping); UPI/gateway/marketplace settlements matched at line level; unreconciled-
  aging alarm ("14 din se 3 entries pending").
- Cash management: denominations at POS sessions, cash-deposit tracking (counter → bank),
  petty-cash imprest ledgers with mobile top-up requests.

## 4. Credit & lending adjacency (phase 2+, partner-led)

Invoice-backed credit: with consent, share receivables health with lending partners (AA +
OCEN rails) — "₹4L stuck in receivables, partner offers invoice discounting" (referral
revenue, no balance-sheet risk). Udyam-linked scheme awareness (CGTMSE etc.) as content.

## 5. Ugly cases

Same-amount-same-day UPI collisions (ref-first matching, never amount-only); gateway
settlement spanning month-end (cutoff discipline); bounced NACH with fees; partial payments
against QR (UPI allows edit — handle under/over payment flows); bank feed duplicates after
statement re-import (idempotent line hashing); multi-bank same-narration transfers
(self-transfer detection); cash-deposit limits triggering 269ST/SFT thresholds (warnings).

## 6. Regulatory notes

PA/PG licensing stays with partners (we orchestrate, never touch funds — no PA license
needed v1); DPDP consent for AA data; RBI e-mandate AFA rules as data; no storage of full
card data ever (SAQ-A posture).
