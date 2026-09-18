# Module Spec: HR & Payroll (India)

## 1. Job-to-be-done
"Salary sahi, time pe, bina PF-ESI ki tension ke" — attendance to bank credit with statutory
correctness, plus the employee lifecycle around it.

## 2. Entities
**HR masters:** `employee` (with PAN/Aadhaar-ref/UAN/ESIC/bank), `department`, `designation`,
`grade`, `employment_type` (permanent/contract/gig), `shift_type`, `holiday_list`,
`leave_type` + policies, `attendance_device` (biometric).
**HR documents:** `attendance`, `checkin` (geo/selfie/biometric event), `leave_application`,
`shift_assignment`, `onboarding`/`separation` (checklists), `letter` (offer/appointment/
increment — template engine).
**Payroll:** `salary_structure` (earnings/deductions with formula engine), `salary_slip`,
`payroll_run`, `bonus/arrear/loan` (employee loans with EMI), `full_and_final`,
`statutory_report` artifacts (ECR, ESI return, PT returns, 24Q).

## 3. Core flows
- **Attendance:** biometric-device sync / mobile geo-fenced check-in with selfie / web —
  shift-aware, OT calculation, late/early rules → attendance register.
- **Leave:** policy accruals (CL/SL/EL, carry-forward, encashment), apply→approve on
  mobile/WA, balance visibility.
- **Payroll run:** attendance + leave + OT + variable inputs → gross-up → statutory engine
  (PF 12% with wage ceiling options, ESI 0.75/3.25% w/ ₹21k gate, PT per-state slabs, TDS
  via old/new regime projections with investment declarations, LWF per state) → net → bank
  payout file/API → payslips (vernacular, WA/email) → GL posting (accrual + payment) →
  compliance artifacts (ECR file for EPFO, ESI, PT returns, 24Q quarterly TDS).
- **Lifecycle:** offer→onboarding checklist→probation→increments (letters + salary revision
  with arrears)→F&F (gratuity [Payment of Gratuity Act], leave encashment, notice recovery).

## 4. Feature ladder
- **MVP:** employees, attendance (mobile + manual), leave, salary structures, monthly run
  with PF/ESI/PT/TDS, payslips, bank file, GL posting.
- **v1:** biometric integrations, shifts + rosters (planning module), employee self-service
  app (payslip, leave, declarations, holiday calendar), investment declaration + proof
  workflow, Form 16 generation, loans/advances, F&F, letters, contractor/gig payouts with
  194C/194J TDS.
- **v2:** recruitment (openings→pipeline→offers), appraisals (goals/OKR-lite, 360 reviews,
  increment cycles), skills matrix, statutory registers (Shops & Establishments per state,
  Factories Act muster rolls), POSH committee tracking, org chart, headcount planning.

## 5. Ugly cases
Mid-month joiner/leaver/revision with arrears; LOP reversal after payroll (supplementary
run); employee crossing ESI wage gate mid-half-year (contribution-period rules); multi-state
PT for one employee transferred (slab proration); regime switch during year; UAN not yet
generated for new joiner (ECR pending queue); contractor vs employee misclassification
warnings; attendance device offline for 3 days (bulk regularization with approval);
salary hold and release; negative net pay (recovery ledger).

## 6. India notes
Statutory engine is versioned rules-as-data with effective dates (rates change; history must
recompute correctly for arrears). State dimension everywhere: PT, LWF, S&E registers, minimum
wages library (advisory warnings). Aadhaar: store reference/last-4 only (arch 05). Labour
Codes: engine parameterized for the wage-definition change (50% basic floor) whenever
notified — flip-switch ready.

## 7. AI assists
Payroll anomaly guard (A9: ghost employees, sudden OT spikes), policy Q&A for employees
("meri EL kitni bachi?"), regime-choice advisor (projection comparison, disclaimered).

## 8. KPIs
Headcount + cost trends, attrition %, attendance/absence heatmap, OT cost, statutory
deposit calendar status (PF by 15th, ESI by 15th, TDS by 7th), leave liability value.
