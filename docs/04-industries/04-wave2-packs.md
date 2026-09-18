# Wave-2 Packs (Outline Specs): Restaurant, Construction, Healthcare, Education, Logistics

> Outline depth; each expands to a full pack spec at wave start (checklist in 00 §3 applies).

---

## Pack: `restaurant-qsr`
**Persona:** restaurants, cafés, QSR chains, cloud kitchens, caterers.
POS restaurant mode is the core (03-modules/09 §4): tables/KOT/kitchen display/split bills;
cloud-kitchen: aggregator order ingestion (Zomato/Swiggy APIs), commission reconciliation,
menu sync. **Recipe costing:** menu item → recipe BOM → theoretical vs actual consumption
(variance = theft/wastage detector — the owner's #1 question). Central kitchen → outlet
indent/transfer flows. FSSAI license fields + food-safety checklists; liquor stock registers
(state excise formats) where licensed. KPIs: food cost %, item-wise contribution, wastage
variance, aggregator commission burden, table turns, peak-hour heatmap.
Ugly: recipe yield variation; aggregator promo cost accounting; GST 5%-no-ITC vs 18%-ITC
regime handling by establishment type.

## Pack: `construction-realestate`
**Persona:** civil contractors, interior/fit-out firms, small builders.
Project-centric: BOQ import (Excel) → project budget; work-completion certificates → RA
(running account) bills with **retention money** + advance recovery + price escalation;
site-wise material tracking (theft-prone: site issue vs consumption norms variance);
subcontractor management (with-material vs labor-only, their RA bills, TDS 194C);
machinery/equipment logs (own + hired, hire-charge tracking); works-contract GST (18%/12%
by contract type, TDS-GST 2% on government works). Builder mode (RERA-lite): unit inventory
(flats), booking → agreement → demand letters by construction stage → collections,
RERA account rules (70% escrow warnings). KPIs: project cost vs BOQ, WIP certification lag,
retention receivable, site material variance, labor productivity.
Ugly: escalation claims; deviation/extra items approval; defect-liability retention release.

## Pack: `healthcare-clinic`
**Persona:** clinics, polyclinics, diagnostic labs, dental/eye chains, small hospitals (<50
beds). NOT an EMR replacement at v1 — operations + billing first, clinical-lite.
Appointments (slots, tokens, WA confirmations/reminders, walk-in queue board) → encounter
(vitals, notes, Rx print — doctor's letterhead) → billing (consult + procedures + pharmacy
via `pharma-retail` + lab). Lab: test catalog with parameter templates → sample barcode →
result entry with ranges → report PDF (pathologist e-sign) → WA delivery. Packages
(health checkups), insurance/TPA billing-lite (claim tracking), doctor revenue-share
payouts. ABDM readiness (ABHA id capture, consent flows) as phase-2 toggle. Compliance:
clinical-establishment registration fields, biomedical-waste log, PCPNDT register formats
(where applicable). KPIs: appointments/day, no-show %, revenue per doctor, lab TAT,
package conversion, pharmacy attach rate.
Ugly: doctor % on collected-not-billed; refunds on packages partially consumed; TPA
short-payments.

## Pack: `education`
**Persona:** schools (K-12 budget/mid segment), coaching institutes, colleges-lite.
Student master (admission no, class/section/batch, parent contacts, transport route,
category for fee concessions); **fee engine:** fee structures (heads × class × term),
sibling/merit/staff concessions, fine rules, payment plans, online payment links + UPI,
receipts, defaulter follow-ups (WA to parents, escalation ladders), refund rules;
transport: routes/stops/vehicle link (fleet), transport fees; staff: teacher payroll via
HR (academic calendar leave rules); coaching mode: batches, demo classes → CRM pipeline,
course packages with installments, attendance-linked parent updates.
Communication hub: circulars/homework via WA/app (portal). Exams/results-lite (marks entry →
report cards) — full LMS is out of scope (integrate, don't build).
KPIs: fee collection % vs due, defaulter aging by class, admission funnel, batch fill rates,
teacher load. Ugly: mid-year admission proration; RTE quota fee waivers; TC issuance with
dues clearance; fee regulation caps by state.

## Pack: `logistics-transport`
**Persona:** fleet owners (trucks 5–200), transport contractors, C&F agents.
Trip management: consignment booking (LR/bilty generation — the sector's invoice-equivalent
document) → trip sheet (vehicle+driver+route) → expenses en route (diesel/toll/driver
advance via driver app) → POD capture (photo/OTP) → freight billing (per ton/km/trip,
detention charges) → **trip P&L** (the owner's obsession). Vehicle docs & FASTag/fuel-card
feeds via fleet module; driver settlements (advance vs expense vs incentive); market-vehicle
(hired) trips with supplier freight costing; GST: RCM on GTA (5% RCM vs 12% FCM election),
e-way bill native per trip; consignee/consignor portals for tracking.
KPIs: per-vehicle per-km cost & profit, empty-km %, POD pendency (billing blocker),
detention recovery, driver advance exposure, doc-expiry board.
Ugly: multi-consignment part-load trips (P&L allocation); diesel price volatility contracts;
accident/insurance claim trails; driver cash reconciliation.
