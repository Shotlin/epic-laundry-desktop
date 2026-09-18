# Wave-3 Packs (Outline Specs): Hotel, Agri, Process-Mfg, Nonprofit, Jewellery, Auto-Service

> Thinnest outlines — enough to prove the platform carries them; full specs at wave start.

---

## Pack: `hospitality-hotel`
Rooms/rate-plans/occupancy calendar; reservations (direct/OTA via channel manager
connectors); check-in (ID capture, C-Form for foreigners) → folio (room + restaurant POS
+ services cross-posting) → checkout/settlement; housekeeping status board; night audit;
GST: tariff-slab rates, composite vs mixed supply on packages. KPIs: occupancy/ADR/RevPAR,
OTA commission burden, F&B attach.

## Pack: `agri-mandi`
Aadhat (commission-agent) accounting: farmer consignments → auction lots → buyer sales with
commission/market-fee/hamali deductions → farmer payout statements (the "patti" — sacred
document format); weighbridge integration (gross/tare), quality deductions (moisture %,
foreign matter); bardana (gunny bag) deposit tracking; APMC cess/market-fee registers;
cash-heavy compliance guardrails (40A(3), 269ST warnings); FPO mode: member share capital,
produce pooling, patronage payouts. Mandi reality: offline-first, vernacular-first, voice
entry priority. KPIs: daily arrivals/lots, commission earned, farmer dues, bardana balance.

## Pack: `manufacturing-process`
Recipe/formula BOMs (% composition, batch scaling), co/by-products with cost splits, yield
variance analysis, batch genealogy (lot-to-lot), tank/silo inventory (level-based), QC
parameter trending (SPC), FSSAI/batch-manufacturing-records (food) or Schedule-M docs
(pharma-mfg), shelf-life from production date. Ugly: circular recipes (rework as input),
in-process moisture-loss norms.

## Pack: `nonprofit`
Donations (receipts with 80G details, 10BD/10BE annual statements data), donor CRM
(pledges, recurring giving via subscriptions), grants (funder budgets → utilization
tracking → FCRA-compliant reporting for foreign funds, separate FCRA bank/books
dimension), programs/projects as cost dimensions, volunteer registry, trust-accounting
formats (12A/80G renewals calendar). KPIs: program expense ratio, grant burn vs milestones,
donor retention.

## Pack: `jewellery`
Metal-rate board (daily gold/silver rates → price = weight × rate + making + stones − 
exchange); karat/purity masters, HUID/hallmark tracking per piece, stone details; old-gold
exchange flows (purity testing deduction); scheme deposits (11+1 monthly plans — liability
ledgers + maturity redemption with regulatory caps); karigar (artisan) issue/receive with
wastage norms (gold loan-out tracking — theft-sensitive); GST 3%/5% making-charge
treatments; TCS/PAN thresholds on high-value cash sales. KPIs: metal position (owned vs
customer), scheme liability, karigar wastage variance.

## Pack: `automotive-service`
Vehicle master per customer (reg no → service history); job card (complaints → inspection
checklist → estimate → approval via WA → work + parts → invoice); insurance claim jobs
(surveyor, approvals, salvage); parts inventory with alternates; service reminders
(km/time-based → CRM campaigns); technician productivity (flag hours). KPIs: bay
utilization, average repair order value, parts attach rate, comeback rate.

---

### Platform proof
Six more verticals, zero new kernel concepts: every requirement above maps to overlays
(fields/validations/workflows/prints/reports/seeds) + existing modules. If a wave-3 pack
ever *does* demand a kernel change, that change gets designed platform-wide first
(principle 6).
