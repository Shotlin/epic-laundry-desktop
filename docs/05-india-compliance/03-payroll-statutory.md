# Payroll Statutory Engines (companion to 03-modules/07-hr-payroll.md)

> Module doc owns flows/UX; this doc owns the *rules* — all as versioned effective-dated data.

## 1. EPF (Employees' Provident Fund)

Employee 12% of PF wages; employer 12% split (EPS 8.33% capped at ₹15k wage ceiling, balance
to EPF); admin charges (0.5%, min rules); voluntary PF; ceiling elections (restrict to
₹15k vs full-wage options at employer policy); international workers flag. Outputs: ECR
text/csv format (UAN-wise), challan summary, Form 5/10/3A/6A data, UAN onboarding queue
(missing-UAN employees held with reminder), KYC-mismatch report. Interest/damages
calculators (7Q/14B) for late deposit.

## 2. ESI

Gate: establishments ≥10 employees (state variants) & employee gross ≤ ₹21,000 (₹25k
disabled); employee 0.75%, employer 3.25%; **contribution-period lock**: Apr–Sep/Oct–Mar —
an employee crossing the ceiling mid-period continues until period end (the classic
hand-calculation error we kill); return/challan formats; IP registration queue.

## 3. Professional Tax (state engines)

Per-state slab tables (Maharashtra, Karnataka, WB, Gujarat, MP, Telangana, AP, TN by
half-year…), registration types (PTRC/PTEC), payment cadences (monthly/half-yearly/annual by
state + liability size), return formats per state. Employee transfers mid-month → state
attribution rules. Director/partner PTEC reminders (the forgotten one).

## 4. LWF (Labour Welfare Fund)

State × frequency (monthly/half-yearly/annual) × employee/employer amounts as data;
applicability by designation class in some states.

## 5. Gratuity & Bonus

Gratuity: eligibility (4 yrs 240 days rule), 15/26 × last-drawn basic per year, ₹20L
exemption cap; provision computation (actuarial-lite report for auditors). Bonus (Payment of
Bonus Act): eligibility wage ≤ ₹21k, calculation ceiling ₹7k/min-wage, 8.33%–20% allocable
surplus inputs, set-on/set-off registers, Form C/D data.

## 6. Salary TDS (§192)

Regime handling (old/new; new default with opt-out), projection engine (annualize + declared
investments → monthly TDS with true-up), proof-verification workflow (Jan–Feb crunch),
perquisite valuation catalog (car, rent-free accommodation, ESOP basics), Form 12BB
collection, 24Q + Form 16 Part A/B generation, previous-employer income aggregation (Form
12B), marginal-relief handling.

## 7. Minimum wages & labour-code readiness

Advisory library: state × zone × skill schedules (updatable dataset) with structure-breach
warnings. Labour Codes (wage-definition 50% floor, OSH working-hour rules): engine
parameters staged behind effective-date flags — activation is a data update when notified
(module doc §6).

## 8. Registers & inspections

Auto-generated: muster roll, wage register, overtime, fines/deductions, leave registers in
state S&E / Factories Act formats; unified-return data (Shram Suvidha) prep; inspection-mode
export (date-ranged, signed PDFs).

## 9. Golden-file policy

Fixture employees per scenario: ceiling-crossers, mid-period joiners/leavers, multi-state
transfers, arrears with retro statutory recalcs, LOP reversals, regime switches, gratuity/
bonus boundary cases — every rules-data update must keep all payslips reproducing
historically (bit-for-bit) and compute deltas only via dated amendments.
