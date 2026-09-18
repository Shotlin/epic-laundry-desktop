# Module Spec: Inventory

## 1. Job-to-be-done
Always know what's in stock, where, worth how much — and never lose a sale to a stockout or a
rupee to dead/expired stock.

## 2. Entities
Masters: `warehouse` (tree: store→zone→rack→bin), `uom` + conversions, `batch`, `serial_no`,
`stock_reorder_rule`, `fulfillment_route` (rules engine — the Odoo S11 adoption).
Documents: `stock_entry` (receipt/issue/transfer/repack/manufacture), `stock_reconciliation`
(count), `putaway_rule`, `pick_list`, `packing_slip`.
Ledger: `stock_ledger_entry` (append-only qty + valuation projection).

## 3. Core flows
- **Inbound:** GRN → QC hook → putaway suggestion → bin stock.
- **Outbound:** SO/POS/e-comm → route rules (nearest warehouse, MTO, dropship, cross-dock) →
  pick list (mobile scanner) → pack → delivery note → e-way handoff.
- **Transfers:** branch/warehouse transfers; **inter-GSTIN transfer = tax document flow**
  (delivery challan/invoice + e-way) — first-class, not workaround.
- **Counts:** cycle counts by ABC class; reconciliation posts valuation-adjusting entries.
- **Valuation:** FIFO or moving-average per item (set at first transaction); landed-cost
  aware; backdated entries trigger queued revaluation jobs (platform-core §2).

## 4. Feature ladder
- **MVP:** multi-warehouse stock, stock entries, valuation (MAvg), reorder alerts, barcode
  scanning (camera + HID scanners), batch + expiry basics, stock reports (balance, ageing,
  movement).
- **v1:** FIFO, serials, bins + putaway, pick/pack flows, route rules (MTO/dropship/
  cross-dock), quality hooks, cycle counting, UOM conversions everywhere, item variants
  (size/color matrix — garment reality), packaging/repack BOM-lite.
- **v2:** wave/batch picking, WMS mobile mode, demand forecasting reorder (A7), consignment
  stock, warranty/serial service history, 3PL stock sync.

## 5. Ugly cases
Negative stock (blocked by default; override role with forced reason + repost); expiry
FEFO picking for pharma/food; same item bought in kg sold in packets (UOM chains);
variant explosion (shirt × 6 sizes × 8 colors); free samples & wastage (GST ITC reversal
implications); goods in transit between GSTINs at year-end; barcode collisions/reuse;
opening stock migration with batch-wise valuation from Tally.

## 6. India notes
Expiry/batch discipline is regulatory for pharma (Schedule H/H1/X) and food (FSSAI). E-way
bill thresholds per state on movement documents. Job-work material tracking (ITC-04 —
compliance module) requires material-out/material-in pairing. Mandi/agri: weighbridge
integration, moisture/quality deductions at receipt.

## 7. AI assists
A7 reorder proposals, dead-stock alerts with markdown suggestions, count-variance anomaly
detection, photo-based item creation (image → title/attributes/HSN suggestion).

## 8. KPIs
Stock value by warehouse/group, stockout incidents, inventory turns, dead stock (>N days),
near-expiry value, shrinkage %, fill rate/OTIF.
