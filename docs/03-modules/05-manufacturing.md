# Module Spec: Manufacturing

## 1. Job-to-be-done
Plan what to make, know true cost per unit, keep machines and workers busy without chaos, and
trace every batch from raw material to dispatch.

## 2. Entities
Masters: `bom` (multi-level, versioned, with operations + scrap %), `workstation`/`work_center`
(capacity, cost/hr), `operation`, `routing`, `shift_pattern` (from hr).
Documents: `production_plan` (MPS/MRP run), `work_order`, `job_card` (operation-level,
operator-scannable), `material_transfer_for_manufacture`, `stock_entry: manufacture`,
`subcontracting_order` + `challan` (job work out), `downtime_log`, `scrap_entry`.

## 3. Core flows
- **Make-to-stock:** forecast/reorder → production plan → MRP explosion (net requirements
  vs stock + open POs) → material requests + work orders → job cards per operation →
  finish entry (FG in, RM out, scrap) → costing (material + labor + overhead absorption).
- **Make-to-order:** SO → route rule spawns WO chain (multi-level BOMs) with promise dates.
- **Subcontracting (job work):** material-out challan → vendor processing → receipt with
  yield/loss accounting → ITC-04 data captured automatically.
- **Shop floor:** tablet/phone job-card view — start/pause/complete, qty good/rejected,
  downtime reason; feeds OEE.

## 4. Feature ladder
- **MVP (mfg pack pilot):** multi-level BOM, work orders, material issue/receipt, finished-
  goods costing (MAvg), basic capacity view, scrap tracking.
- **v1:** routings + job cards, production plan/MRP, subcontracting with challan/ITC-04,
  batch/serial genealogy (full trace), operation costing, rejection → quality NC link,
  BOM versioning with ECO-lite (change log + effective dates).
- **v2:** finite-capacity scheduling (drag Gantt), OEE dashboards, maintenance module link
  (planned PM calendars), PLM-lite (drawings on BOM, revision control), IoT hooks (machine
  counters), byproduct/co-product costing.

## 5. Ugly cases
BOM changed mid-open-WO (pin BOM version at WO creation); partial completions across shifts
/days; rework orders (negative yield); power-cut mid-entry on shop floor (offline job-card
app); material substitution with approval; overlapping subcontractor challans; costing when
RM price arrives late (landed cost after production) → queued revaluation; scrap sales with
GST.

## 6. India notes
Job-work economy is huge (textiles, auto components, pharma loan-licensing): challan
discipline + ITC-04 + 143 timelines (1yr/3yr return rules) must be native. Factory
compliance adjacency: contract-labor headcount feeds HR/payroll registers. E-invoice on
subcontractor invoices; e-way on challans.

## 7. AI assists
Yield anomaly detection, bottleneck explanation ("WO late because W2 queue 3 days"),
BOM cost-driver analysis, voice job-card updates (shop floor Hindi).

## 8. KPIs
Plan adherence %, WO cycle time, OEE (v2), scrap %, cost variance (std vs actual),
WIP value, on-time dispatch.
