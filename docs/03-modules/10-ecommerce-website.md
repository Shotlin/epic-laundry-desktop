# Module Spec: E-commerce & Website

## 1. Job-to-be-done
Sell online from the same catalog and stock as the counter — own storefront, marketplaces,
and ONDC — without a separate "online system" to reconcile.

## 2. Entities
`web_store` (theme, domain, policies), `web_item` (channel-specific title/images/SEO over
catalog item), `web_order` (→ sales_order), `cart/checkout`, `marketplace_listing`
(Amazon/Flipkart/Meesho mapping + fee rules), `ondc_catalog` (v2), `shipment` (logistics
module link), `content_page/blog/form` (website).

## 3. Core flows
- **Own store:** catalog publish (variants, images, price lists) → cart/checkout (guest +
  OTP login, UPI/cards/COD via gateway connectors) → order → route-rule fulfillment → ship
  (Shiprocket/Delhivery labels + tracking) → auto invoice + e-invoice if B2B → returns/RTO
  flow with refund handling.
- **Marketplace sync:** listings push, order pull, inventory sync (buffer rules per channel),
  settlement reconciliation (fees/commissions/TCS 52(1)(h) → GL + GSTR-8 credit matching),
  returns/claims tracking.
- **Website:** block-based builder (hero/features/forms), blog, lead forms → CRM, appointment
  booking → calendar.

## 4. Feature ladder
- **v1.5 (module is tier-2):** own storefront (hosted subdomain + custom domain), payments,
  shipping labels, COD reconciliation, WhatsApp catalog sync, basic SEO.
- **v2:** marketplace connectors (Amazon/Flipkart first), settlement recon, ONDC seller app,
  discount coupons + campaigns, abandoned-cart journeys (marketing), B2B portal ordering
  (dealer price lists, credit limits, repeat-order UX).

## 5. Ugly cases
Oversell during flash sync gap (channel buffers + oversell queue); RTO mountains (COD returns
with stock re-grading damaged/sellable); marketplace settlement minus penalties/ads fees
(recon rules); GST on shipping charges; price parity conflicts across channels;
variant image storage discipline.

## 6. India notes
COD still ~40-50% outside metros — COD cash-cycle reports matter. Marketplace TCS (GST 52)
credit reconciliation is a monthly CA pain — automate. ONDC is a strategic wedge: small
sellers get discovery without marketplace fees; being ONDC-native early is differentiation.

## 7. AI assists
Listing copy generation (title/bullets per marketplace style), image background cleanup,
returns-reason clustering, demand signals to inventory (A7).

## 8. KPIs
Channel-wise revenue/margin (post-fees), conversion rate, RTO %, settlement pending,
stock-sync health.
