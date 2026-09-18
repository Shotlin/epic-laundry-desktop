# Module Spec: Fixed Assets & Quality

# Part A — Fixed Assets

## 1. Job-to-be-done
Track everything the company owns — purchase to scrap — with depreciation that satisfies both
Companies Act and Income Tax, and maintenance that prevents breakdowns.

## 2. Entities
`asset` (from purchase or opening; serial/tag/QR, location, custodian), `asset_category`
(useful life, dep method defaults, GL map), `depreciation_schedule` (dual books: Companies
Act SLM/WDV by useful life vs IT Act block-of-assets WDV), `asset_movement` (location/
custodian transfer), `asset_maintenance` (PM calendar + logs → field-service link),
`asset_repair` (capitalizable vs expense), `asset_disposal` (sale with GST / scrap /
write-off, profit-loss computation), `asset_revaluation`, `cwip` (capital work-in-progress
→ capitalization).

## 3. Feature ladder
- **v1:** asset register (bulk import from Tally/Excel), purchase→asset auto-creation
  (threshold rules), dual depreciation books with scheduled runs, movements with custodian
  acknowledgment, disposal with GST invoice, asset QR labels + physical verification app
  (scan-audit mode), CWIP.
- **v2:** maintenance calendars + spares link, insurance policy tracking with renewal
  alerts, lease accounting-lite, asset lifecycle TCO reports, componentization.

## 4. Ugly cases
Asset purchased in parts across months (CWIP aggregation); put-to-use date ≠ purchase date
(IT Act 180-day half-rate rule); partial disposal of a block; revaluation mid-year;
missing-on-verification workflow (investigate → write-off approval chain); ITC on capital
goods (GST rules + 5-year reversal on disposal).

## 5. India notes
Schedule II useful lives shipped as data; IT block rates shipped as data; both versioned.
Physical-verification evidence supports CARO reporting. GST on asset sale computed from
block/ITC history.

---

# Part B — Quality

## 1. Job-to-be-done
Catch bad material before it enters, bad product before it ships, and fix root causes —
with the paperwork audits demand (ISO/FSSAI/GMP-lite).

## 2. Entities
`quality_inspection_template` (parameters: numeric ranges/boolean/visual, sampling plan),
`quality_inspection` (against GRN/WO/delivery; results, verdict), `non_conformance`
(NC: severity, disposition — reject/rework/concession), `capa` (corrective/preventive
action with owner + due + effectiveness check), `quality_goal/audit` (internal audit
checklists).

## 3. Flows
Inbound: GRN → auto-inspection by item rules → pass/fail → QC-hold warehouse zone until
release (workflow overlay). In-process: job-card checkpoints. Outbound: pre-dispatch
inspection certificate (customer-required formats). NC → CAPA loop with recurrence tracking.

## 4. Feature ladder
- **v1 (mfg pack):** inspection templates + GRN/WO/dispatch hooks, QC-hold flow, NC register,
  basic CAPA, certificates of analysis (pharma/food print formats).
- **v2:** sampling plans (AQL tables), SPC charts on parameters, supplier quality scores
  (feeds purchase scorecard), audit management, instrument calibration schedules.

## 5. Ugly cases
Partial lot acceptance (split batch disposition); customer-return triggered NC with batch
recall trace (one-click "where did this batch go?"); inspector role separation
(maker-checker); parameter units mismatch; retest after rework loops.

## 6. India notes
FSSAI (food), Schedule M GMP (pharma), BIS/ISI marks (manufactured goods) drive template
packs; export businesses need CoA + pre-shipment inspection docs — ship as print/report
presets per industry pack.

## AI assists (both parts)
Verification-photo anomaly checks, NC clustering ("same defect, same supplier, 3 months"),
maintenance-due prediction from usage logs.

## KPIs
Asset: register value vs GL tie-out, dep run status, verification coverage, insurance
renewals due. Quality: inbound rejection %, first-pass yield, NC aging, CAPA closure rate,
supplier defect pareto.
