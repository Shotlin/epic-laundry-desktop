# Module Catalog (Canonical Registry)

> Names here match blueprint §6 and are binding for code, packs, and docs.
> Tier P = platform-bundled (always on) · 1 = GA wave 1 (MVP→v1) · 2 = v1.5–v2 · 3 = later.
> "Spec" points to the deep spec file; grouped files cover several modules.

| # | Module id | Name | Tier | Depends on | Spec |
|---|---|---|---|---|---|
| 1 | core-platform | Kernel services | P | — | 02-architecture/02 |
| 2 | org | Companies, branches, fiscal | P | core | 06-data-models/01 |
| 3 | parties | Unified party (customer/supplier/contact) | P | org | 06-data-models/01 |
| 4 | catalog | Items, UoM, price lists | P | org | 06-data-models/01 |
| 5 | collab | Chatter, activities, notifications | P | core | 02-architecture/02 §5 |
| 6 | documents | Files, e-sign, doc mgmt | P | core | 13-extended |
| 7 | analytics | Reports, dashboards, pivot, spreadsheet | P | core | 13-extended |
| 8 | studio | No-code customization | P | core | 02-architecture/04 |
| 9 | crm | Leads, pipeline, comms | 1 | parties | 01-crm |
| 10 | sales | Quotes, orders, invoicing, pricing | 1 | parties, catalog, accounting | 02-sales |
| 11 | pos | Point of sale (retail + restaurant) | 1 | sales, inventory | 09-pos |
| 12 | purchase | RFQ, PO, GRN, bills | 1 | parties, catalog, accounting | 03-purchase |
| 13 | inventory | Stock, warehouses, batches, serials | 1 | catalog | 04-inventory |
| 14 | accounting | GL, AR/AP, banking core, budgets | 1 | org, parties | 06-accounting |
| 15 | india-compliance | GST, e-invoice, e-way, IMS, TDS/TCS | 1 | accounting | 05-india-compliance/* |
| 16 | banking | Feeds, reconciliation, UPI, payouts | 1 | accounting | 06-accounting §7 |
| 17 | expenses | Employee expenses, advances | 1 | accounting, hr | 13-extended |
| 18 | hr | Employee lifecycle, attendance, leave, shifts | 1 | org | 07-hr-payroll |
| 19 | payroll | India statutory payroll | 1 | hr, accounting | 07-hr-payroll |
| 20 | projects | Projects, tasks, timesheets, billing | 1 | parties | 08-projects |
| 21 | helpdesk | Tickets, SLA, portal | 1 | parties, collab | 11-helpdesk-field-service |
| 22 | manufacturing | BOM, work orders, planning, subcontract | 1* | inventory | 05-manufacturing |
| 23 | quality | Inspections, NCs, CAPA | 1* | inventory | 12-assets-quality |
| 24 | assets | Fixed assets, depreciation, maintenance | 1 | accounting | 12-assets-quality |
| 25 | ecommerce | Storefront + marketplace sync | 2 | sales, inventory | 10-ecommerce-website |
| 26 | website | Site/CMS/forms | 2 | core | 10-ecommerce-website |
| 27 | subscriptions | Recurring billing, plans | 2 | sales, accounting | 13-extended |
| 28 | marketing | Campaigns, WhatsApp/email/SMS journeys | 2 | crm | 13-extended |
| 29 | field-service | Service visits, AMC, technician app | 2 | helpdesk | 11-helpdesk-field-service |
| 30 | recruitment | Openings→offers | 2 | hr | 07-hr-payroll §8 |
| 31 | appraisals | Goals, reviews | 2 | hr | 07-hr-payroll §8 |
| 32 | fleet | Vehicles, drivers, costs | 2 | assets | 13-extended |
| 33 | logistics | Shipping, carriers, e-way linkage | 2 | inventory | 13-extended |
| 34 | planning | Shift/resource scheduling | 2 | hr/projects | 13-extended |
| 35 | approvals | Standalone approval requests | 2 | collab | 13-extended |
| 36 | knowledge | Wiki/SOPs | 2 | collab | 13-extended |
| 37 | budgeting | Budgets, forecasts, variance | 2 | accounting | 06-accounting §9 |
| 38 | portal | Customer/vendor/employee portals | 2 | core | 13-extended |
| 39 | integrations | Connector framework + catalog | 1 | core | 02-architecture/04 §6 |
| 40 | ai-assist | AI copilots surface | 1 | core | 02-architecture/06 |
| 41 | loyalty | Points, memberships, gift cards | 2 | pos/sales | 09-pos §6 |
| 42 | rental | Rental orders, availability | 3 | inventory | (pack-driven) |
| 43 | lending | Loan books (NBFC-lite) | 3 | accounting | (pack-driven) |

\* `manufacturing`/`quality` are wave-1 for the manufacturing industry pack pilot; other packs
can GA without them.

## Spec template (used by every module doc)

1. **Job-to-be-done** — the owner sentence.
2. **Entities** — masters/documents/ledgers introduced.
3. **Core flows** — happy paths as pipelines.
4. **Feature ladder** — MVP / v1 / v2.
5. **Ugly cases** — principle 12 list the module must survive.
6. **India notes** — statutory/cultural specifics.
7. **AI assists** — mapped to 02-architecture/06 catalog.
8. **KPIs** — module-level dashboard defaults.
