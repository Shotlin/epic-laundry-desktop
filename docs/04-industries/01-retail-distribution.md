# Industry Packs: Retail (general) & Distribution (FMCG)

# Pack: `retail-general` (Wave 1)

**Persona:** kirana → supermarket chains; apparel; electronics/mobile stores.
**Reference displacement:** Vyapar (grows out of), Tally+POS combos, GoFrugal.

## Seeds
Retail CoA; item groups by store type (grocery/apparel/electronics interview); MRP-based
price list + margin-based purchase pricing; barcode label templates; counter + backroom
warehouse layout; roles: owner/cashier/store-manager/purchaser.

## Overlays
- Item: `mrp`, `shelf_location`, `min_margin_%` (invoice-time guard), apparel matrix
  (size/color variants), electronics serial+warranty capture at sale.
- POS-first navigation preset; khata (credit) mode prominent.
- Validations: sale below cost/min-margin → approval; MRP breach block.

## Vertical flows
Weighing-scale items (label with embedded weight barcode); mobile-shop IMEI tracking
(serial = IMEI, warranty claims); apparel season/markdown workflows; franchise mode
(HQ price control, store P&L).

## Dashboards/KPIs
Daily sales per store/counter, basket size, category margins, dead stock, khata outstanding,
expiry (grocery).

## Registers/prints
GST invoice + B2C receipt, price-drop labels, stock-take sheets, scheme flyers (WA).

---

# Pack: `distribution-fmcg` (Wave 1)

**Persona:** FMCG/general-goods distributors, super-stockists, wholesalers with DSMs (delivery
salesmen) doing beat routes.
**Reference displacement:** Marg, Botree/Ivy (brand-mandated DMS), Tally.

## Seeds
Distribution CoA; brand → category item hierarchy; price lists: PTR/PTS/MRP structure;
scheme masters; van/beat/route masters; roles: owner/DSM/godown-keeper/accountant.

## Overlays
- Party: `retailer_beat`, `channel_type` (GT/MT), credit day+limit by class.
- Item: case/box/piece UOM chain (buy cases, sell pieces), brand margins.
- **Schemes engine** (the vertical's soul): qty slabs (10+1), value discounts, QPS (quarterly
  performance schemes), claim tracking against brand credit notes — scheme vs claim
  reconciliation report ("mera claim kahan atka?").

## Vertical flows
- **Beat/van sales:** Epic Field app — route plan, retailer visit sequence, order/spot-sale
  (van stock), collections (UPI/cash) with instant receipt, shop-shut/no-order reasons,
  day-end van reconciliation (stock + cash).
- Brand claims: damaged/expiry returns to company, scheme claims, display payouts.
- Replenishment: brand order suggestions from offtake velocity.

## Dashboards/KPIs
Beat productivity (calls/orders/strike rate), DSM-wise collection vs target, brand-wise
margin after schemes, claim aging, van stock variance, retailer churn (no order 30d).

## Ugly cases
Piece-rate GST when case rates differ; expiry returns valuation; brand price revision with
stock-in-hand margin protection claims; multiple beats sharing one retailer.
