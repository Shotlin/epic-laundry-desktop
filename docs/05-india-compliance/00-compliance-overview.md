# India Compliance — Overview & Engineering Doctrine

> This section is Epic BOS's moat (vision 03 §3). Design doctrine: **compliance is a
> product surface, an engine, and a release lane — not a checklist.**

---

## 1. Doctrine

1. **Rules-as-versioned-data.** Every statutory rule (rates, thresholds, slabs, formats,
   validations) is data with effective-date ranges — never hard-coded. History recomputes
   correctly; future changes ship as data updates through the statutory fast lane
   (arch 03 §5).
2. **Deterministic engines.** GST/TDS/payroll math is rule-engine computed, golden-file
   tested (arch 01 §8). AI never computes tax (arch 06 §2).
3. **Owner-grade surface.** The **Compliance Cockpit** — one screen: traffic lights per
   obligation (GST returns, e-invoice health, TDS deposits, PF/ESI, MSME 43B(h)), rupee
   amounts at stake, plain-language actions ("File GSTR-3B by 20th — ₹1.2L payable; ITC
   blocked ₹18k from 3 suppliers — tap to remind them").
4. **CA-grade depth.** Every cockpit tile drills to registers, reconciliations, working
   papers, and export formats an auditor accepts.
5. **Filing via GSP partners first** (Cleartax/IRIS-class APIs), own GSP evaluation later
   (arch 05 §3). Portal-upload JSON fallback always available (no API dependency for
   correctness).

## 2. Obligation calendar (auto-maintained per tenant from registrations + thresholds)

| Cadence | Obligations (defaults; tenant-specific by registration type) |
|---|---|
| Continuous | e-invoice (on issue; 30-day IRP window rule for ≥₹10Cr), e-way (on movement), IMS actions |
| Monthly | GSTR-1 (11th), GSTR-3B (20th), PF ECR (15th), ESI (15th), TDS deposit (7th), PT (state-wise) |
| Quarterly | GSTR-1/3B (QRMP), TDS returns 24Q/26Q, advance tax reminders (15th Jun/Sep/Dec/Mar) |
| Annual | GSTR-9/9C, Form 16, 10BD (nonprofit), MSME-1 half-yearly, ITR/audit season prep artifacts |

Calendar drives: notifications ladder (owner WA + accountant email), cockpit lights,
escalation to CA-partner console.

## 3. Registration model

`compliance_profile` per company: GSTINs (multi-state registry with type: regular/
composition/SEZ/ISD), PAN/TAN, PF/ESI codes, PT registrations (state-wise), IEC, MSME/Udyam,
FSSAI/drug licenses (pack-provided), LUT bond numbers with validity. Profile gates which
engines/validations/returns activate — a composition dealer never sees GSTR-1 screens.

## 4. Section contents

| File | Engine |
|---|---|
| 01-gst.md | GST: tax determination, e-invoicing, e-way, returns, IMS, reconciliation |
| 02-direct-tax-tds-tcs.md | TDS/TCS engines, 26AS/AIS recon, advance tax |
| 03-payroll-statutory.md | PF/ESI/PT/LWF/gratuity/bonus/TDS-salary (pairs with 03-modules/07) |
| 04-banking-payments.md | UPI/NEFT rails, account aggregator feeds, e-mandates, payouts |
| 05-corporate-regulatory.md | MCA audit trail, DPDP, MSME 43B(h), sector licenses, cash-limit guardrails |
