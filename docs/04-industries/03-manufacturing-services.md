# Industry Packs: Discrete Manufacturing & Professional Services

# Pack: `manufacturing-discrete` (Wave 1)

**Persona:** fabrication/machining shops, auto-component vendors (OEM tier-2/3), electronics
assembly, garment factories. 10–500 workers.
**Displacement:** Tally + Excel planning + hope; ERPNext implementations.

## Seeds
Mfg CoA (WIP/FG/RM accounts, absorption heads); UOM library (kg/mm/nos/meters); workstation
templates by interview (machining/stitching/assembly lines); shift patterns; roles:
production-manager, supervisor, stores, QC, operator (job-card-only permission).

## Overlays
- Item: `drawing_no` + revision, `material_grade`, `make_buy_flag`, customer-part-number
  cross-reference (OEM reality: their PN ≠ your PN).
- Sales: OEM schedule lines (monthly delivery schedules against blanket PO — auto WO
  planning from schedules), ASN/packing-standard prints per OEM.
- Purchase: approved-vendor-list per item (quality requirement), test-certificate demand
  flags.
- Workflows: GRN → QC-hold → release; WO with in-process checkpoints; dispatch with PDI.

## Vertical flows
Job-work BOTH directions (send out for plating/heat-treatment; take in job-work for others —
income side with ITC-04 both ways); tooling/die management (customer-owned tooling registry,
amortization per piece); scrap sales (GST on scrap, TCS 206C(1) where applicable); garment
specifics: size-set ratios, cut-plan → bundles, piece-rate wage capture feeding payroll.

## Dashboards/KPIs
Schedule adherence per OEM, WO aging, rejection ppm (internal + customer), machine
utilization, RM coverage days vs schedules, piece-rate productivity, power/consumables per
unit.

## Ugly cases
Customer schedule revisions mid-month (delta re-planning view); RM price escalation clauses
on old POs; mixed-batch traceability for recalls; operator absent → job-card reassignment;
GST on tooling advances amortized in piece price.

---

# Pack: `services-professional` (Wave 1)

**Persona:** digital/creative agencies, IT services & consultancies, CA/CS/legal firms,
architecture/engineering consultants.
**Displacement:** Zoho suite combos, spreadsheets + Tally at the CA.

## Seeds
Services CoA (no inventory unless enabled); SAC-coded service items; rate cards (role × 
client tier); retainer + milestone templates; roles: partner/PM/member/finance.

## Overlays
- Project-first navigation preset; timesheet nudges on.
- Party: `client_group` (for conflict checks in CA/legal), engagement letters (documents +
  e-sign).
- Sales: proposal builder emphasis; recurring retainers via subscriptions module.

## Vertical flows
Retainer burn tracking (hours vs retainer with rollover rules); milestone billing with
client-approval gates (portal); TDS-heavy receivables (clients deduct 194J — auto 26AS-style
reconciliation of TDS receivable); CA-firm mode: client-compliance calendar (their clients'
GST/TDS deadlines as service tasks — meta, and a Trojan horse for our CA channel);
bench/utilization planning for IT services; reimbursable expenses billed-through with GST
treatment (pure agent rules).

## Dashboards/KPIs
Utilization %, realization rate (billed/standard), project margins, unbilled WIP, retainer
burn, receivable aging with TDS split, pipeline (CRM) weighted forecast.

## Ugly cases
Fixed-bid overrun visibility (earned vs burnt); client scope disputes (change-order trail);
partner draw vs salary structures; export-of-services (LUT, forex realization FIRC tracking,
GST refund data); pro-bono/internal time.
