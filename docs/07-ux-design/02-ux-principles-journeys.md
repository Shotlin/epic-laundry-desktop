# UX Principles & Critical Journeys

## 1. UX laws (product principles 3/4/7/9 made operational)

1. **First session wins:** GSTIN → company auto-configured → guided first invoice → WA
   share → "aapka pehla GST invoice ready" — under 15 minutes, measured in analytics as
   the funnel.
2. **Work queues over navigation:** users open "what needs me" (approvals, drafts, unmatched,
   unfiled) not module trees. Every role gets a queue-first home.
3. **Never re-type:** every flow continues from context (quote→order→invoice pre-filled;
   WA lead → CRM card; bill photo → draft). Copy-create everywhere.
4. **Speed budget:** voucher entry keystroke-parity benchmarked vs Tally quarterly; list
   loads <1s p95 on 3G; POS <100ms local.
5. **Progressive depth:** simple mode hides advanced fields per persona; "show more" is
   sticky per user; packs pre-tune defaults.
6. **Explain money:** every computed figure (tax, valuation, aging, payout) expands to its
   arithmetic — trust through transparency (kills the "software galat hai" call).

## 2. Persona home defaults

| Persona | Home |
|---|---|
| Owner | Cash+bank, today's sales, collect-today list, compliance lights, AI digest |
| Accountant | Unmatched bank lines, unfiled deltas, approval queue, deadline lane |
| Sales rep (mobile) | My beat/day plan, follow-ups due, targets, add-lead/order in 2 taps |
| Store cashier | POS full-screen; nothing else |
| Production supervisor | Line board: WOs by state, material shortages, QC holds |
| CA (partner console) | Client grid × compliance status, bulk filing lanes, notices inbox |

## 3. Journey specs (the ten that make or break adoption)

Each has full flow + edge cases + analytics events; summarized:
1. **Onboard** (GSTIN→invoice): auto-fetch legal data, industry pack pick (5 questions),
   masters import offer (Tally/Excel/contacts), first invoice guided.
2. **Daily billing loop** (counter): search→bill→UPI QR→auto-match — zero-mouse repeatable.
3. **Bill photo → posted purchase**: capture, AI draft, review diff-style, post; trust
   ladder (first 10 need review; then thresholds).
4. **Month-end GST**: cockpit → 2B recon workbench → vendor chase (one-tap WA) → 3B draft →
   GSP file → archive artifact. Target: 4 hours → 40 minutes.
5. **Payroll run**: attendance exceptions → run preview (diff vs last month with reasons) →
   approve → bank file/API → payslips WA → challan reminders.
6. **Collect receivables**: aging → reminder ladder config → promise tracking → collection
   day-list for field reps with UPI collection.
7. **Stock take**: schedule → mobile scan-count (offline) → variance review → approve →
   posted reconciliation.
8. **New sales order → dispatch**: availability check → route rule → pick/pack scan →
   e-way → LR/tracking share.
9. **Approve anywhere**: WA/push → context card (what, who, money impact, history) →
   approve/reject/comment — 30 seconds on a phone.
10. **Month in review** (owner): auto-generated narrative (A4/A5) — sales, margins, cash,
    anomalies, next month watchlist — in tenant language, WA-delivered.

## 4. Accessibility & inclusivity

WCAG 2.1 AA on web; screen-reader labels on all business components; keyboard-complete
(no mouse-only paths); low-literacy support: icon+number-first dashboards, voice input
(A8), audio hints optional; low-end device budget: web app usable on 2GB RAM Android
Chrome; SMS fallbacks where WA absent.

## 5. Localization architecture

String catalog with ICU plurals per language; **domain glossary per language** (reviewed by
trade, not just translators — "challan", "aadhat", "hisab" carry exact trade meanings);
per-tenant language + per-user override; documents printable in buyer's language regardless
of UI language; numerals: Indian grouping everywhere, Devanagari numerals opt-in; date
formats DD-MM-YYYY default; fiscal-year-aware date pickers (FY 26-27 chips).
