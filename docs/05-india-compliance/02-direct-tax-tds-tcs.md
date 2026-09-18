# Direct Tax: TDS / TCS Engines & Reconciliation

## 1. TDS engine (payments side)

- **Section catalog as data** (rates, thresholds, effective dates): 194C (contractors
  1/2%), 194J (professional 10%, technical 2%), 194I (rent 2/10%), 194H (commission),
  194Q (goods purchase 0.1% over ₹50L), 194A (interest), 195 (non-resident, treaty rates),
  192 (salary — payroll engine owns), plus higher-rate rules: 206AB (non-filers),
  no/invalid-PAN 20%.
- **Determination:** vendor master carries PAN status + TDS category + LDC (lower-deduction
  certificates with caps/validity); engine watches *cumulative* thresholds per vendor per FY
  (₹30k single/₹1L annual for 194C etc.) — auto-starts deducting when crossed, with
  catch-up math on the crossing transaction.
- **Posting:** TDS payable by section; deposit challans (7th) with ITNS-281 assist;
  interest computation on late deposit (1/1.5%/month) — the CA's silent gratitude feature.
- **Returns:** 24Q (salary)/26Q (domestic)/27Q (NR) quarterly data prep with FVU-format
  export (or GSP-style API where available), Form 16/16A generation from filed data,
  correction-statement support (the ugly reality).

## 2. TDS receivable (customer deducts from you)

Receivables track expected TDS per invoice (customer category); payment entries book TDS
receivable; **26AS/AIS import reconciliation**: statement lines vs booked TDS receivable —
mismatch report ("client ne kaata par jama nahi kiya") with follow-up templates. Advance-tax
planner uses this net position.

## 3. TCS engine (collections side)

206C catalog: scrap (1%), motor vehicles >₹10L, 206C(1H) goods receipts (0.1% over ₹50L —
interplay-with-194Q resolver: engine determines which side applies per counterparty
declaration), foreign remittance/LRS where relevant. Collection at receipt or invoice per
rule; 27EQ return prep; TCS certificates.

## 4. Advance tax & owner tax planner (differentiator)

Quarterly estimation from live P&L + depreciation (dual books) + 26AS credits → advance-tax
reminder with computed suggestion (disclaimered, CA-shareable working paper). Presumptive
regimes (44AD/44ADA) modeled for micro segment — "estimated tax this year: ₹X" on owner
dashboard, always current.

## 5. Ugly cases (engine must survive)

Vendor crosses 194Q and 206C(1H) simultaneously (declaration workflow); LDC exhausted
mid-payment (split-rate single payment); invoice in March, payment in April (accrual-vs-
payment timing — deduct at credit); PAN becomes invalid retroactively (206AB refresh);
composite invoices (goods+services split for 194C vs 194J); year-end provisions requiring
TDS on provision entries; correction statements after certificate issuance.

## 6. Test policy

Same golden-file doctrine as GST: section fixtures per threshold boundary, higher-rate
triggers, LDC caps, interplay resolver matrix (194Q×206C(1H) × declarations), interest
computations against known CA-verified answers.
