# Industry Packs: Pharma Distribution & Pharma Retail

**Persona:** medical stores/chemists (`pharma-retail`), stockists/CFA agents
(`pharma-distribution`).
**Reference displacement:** Marg (the incumbent to beat), GoFrugal RetailEasy.
**Why wave 1:** regulation *forces* software discipline (batch/expiry/schedule registers) —
highest conversion intent among all SMB verticals.

## Seeds
Pharma CoA; item groups: Schedule H/H1/X, OTC, generics, surgical, ayurvedic; molecule/salt
master (generic alternatives); price to retailer/stockist lists; cold-chain warehouse zone;
roles include registered pharmacist.

## Overlays
- Item: `salt_composition` (multi), `manufacturer`, `schedule_class`, `hsn_pharma_defaults`,
  `storage_condition` (cold chain flag), `pack_size` (1x10 strip conventions),
  `narcotic_flag`, mandatory batch+expiry.
- Party: `drug_license_20/21`, `license_expiry` (hard block on sale if expired —
  distribution), `fssai` (nutraceuticals), doctor master (for Rx-linked sales).
- Enforcement: FEFO picking; near-expiry (90/60/30) escalations; Schedule H1 register
  (patient/doctor/qty auto-logged from POS Rx capture); Schedule X double-lock rules.

## Vertical flows
- **Retail counter:** search by brand OR salt (generic substitution suggestions with margin
  compare), Rx capture (photo + doctor), loyalty for chronic patients + refill reminders
  (WA: "BP ki dawa khatam hone wali hai"), insurance/credit patients.
- **Distribution:** breakage/expiry return inward (CN against brand), batch recall trace
  ("this batch → which 43 retailers"), stockist claims, cold-chain temperature log
  attachment.
- Expiry management P&L: near-expiry liquidation suggestions vs return-window optimization
  (brands accept returns in windows — the pack knows per-brand return policies).

## Compliance surface
Drug License nos. on invoice prints; H/H1/X registers as statutory report presets; DPCO price
ceiling warnings (NPPA list as updatable dataset); e-invoice/e-way as per thresholds;
narcotics register formats.

## Dashboards/KPIs
Expiry exposure (value by window), FEFO compliance %, near-expiry conversions, schedule
register completeness, generic-substitution margin gain, refill-reminder conversion,
batch recall readiness (trace time).

## Ugly cases
Same brand, 6 pack sizes, 3 MRPs in stock simultaneously (batch-wise MRP billing —
non-negotiable feature); half-strip sales (loose qty with strip↔tablet UOM); Rx items in
e-comm (blocked/pharmacist-gated); brand-to-generic switch mid-course; DPCO revision on
in-stock batches; return of cold-chain items (viability rules).
