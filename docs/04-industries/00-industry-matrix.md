# Industry Packs — Matrix & Mechanism

> Mechanism spec: 02-architecture/04 §3 (pack = pure metadata overlay). This file is the
> catalog + capability matrix + build order. Packs are switchable and combinable in-product —
> the ERPNext-verticals + Odoo-industries idea, productized.

---

## 1. Pack catalog & build waves

| Wave | Pack id | Vertical | Wedge rationale |
|---|---|---|---|
| 1 | `retail-general` | Kirana/supermarket/apparel/electronics/mobile shops | Largest count; POS-led adoption |
| 1 | `distribution-fmcg` | FMCG/general distributors & wholesalers | Tally/Marg heartland; schemes+margins pain |
| 1 | `pharma-distribution` + `pharma-retail` | Chemists, stockists | Batch/expiry regulatory forcing function; Marg displacement |
| 1 | `manufacturing-discrete` | Fabrication, auto components, electronics assembly, garments | Job-work + GST complexity = high willingness to pay |
| 1 | `services-professional` | Agencies, IT services, CA/consultants | Projects+timesheets+GST-services; digital-native early adopters |
| 2 | `restaurant-qsr` | Restaurants, cafes, cloud kitchens, caterers | POS restaurant mode; FSSAI |
| 2 | `construction-realestate` | Contractors, builders, interior firms | Project costing + retention + works-contract GST |
| 2 | `healthcare-clinic` | Clinics, diagnostics, small hospitals | Appointments+billing+pharmacy combo |
| 2 | `education` | Schools, coaching institutes | Fees+batches+parent comms |
| 2 | `logistics-transport` | Fleet owners, transporters, 3PL-lite | Trip P&L + e-way native |
| 3 | `hospitality-hotel` | Hotels/guesthouses | Rooms+POS+OTA sync |
| 3 | `agri-mandi` | Agri traders, commission agents, FPOs | Weighbridge, quality deductions, aadhat |
| 3 | `manufacturing-process` | Food, chemicals, paints | Formula/recipe BOMs, yield variance |
| 3 | `nonprofit` | NGOs, trusts | Donations (80G), grants, FCRA books |
| 3 | `jewellery` | Jewellers | Metal rates, karat, HUID, scheme deposits |
| 3 | `automotive-service` | Garages, dealerships-lite | Job cards on vehicles, spares |

## 2. Module × pack matrix (● core to pack ○ optional)

| Module | Retail | Distrib | Pharma | Mfg-D | Services | Resto | Constr | Health | Edu | Logi |
|---|---|---|---|---|---|---|---|---|---|---|
| pos | ● | ○ | ● | | | ● | | ○ | | |
| sales | ● | ● | ● | ● | ● | ○ | ● | ● | ● | ● |
| crm | ○ | ● | ○ | ● | ● | ○ | ● | ● | ● | ● |
| purchase+inventory | ● | ● | ● | ● | ○ | ● | ● | ● | ○ | ○ |
| manufacturing | | | | ● | | ○(recipes) | | | | |
| accounting+compliance | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| hr+payroll | ○ | ○ | ○ | ● | ● | ● | ● | ● | ● | ● |
| projects | | | | ○ | ● | | ● | | | |
| helpdesk/field-service | ○ | ○ | | ○ | ○ | | ○ | ○ | ○ | ○ |
| subscriptions | | | | | ● | | | ○ | ●(fees) | |
| ecommerce | ● | ○ | ○ | ○ | | ○ | | | | |
| fleet/logistics | ○ | ● | ○ | ○ | | | ● | | ●(buses) | ● |
| assets | ○ | ○ | ○ | ● | ○ | ● | ● | ● | ● | ● |
| quality | | | ●(recall) | ● | | ●(FSSAI) | ○ | ● | | |

## 3. What every pack ships (checklist — enforced by pack certification)

1. Onboarding interview (5 questions) → seeded company: CoA variant, item groups, tax
   templates, price lists, warehouse layout, roles.
2. Field overlays + validations (entity extensions).
3. Workflow overrides (states/approvals unique to the vertical).
4. Print formats (invoice variants, statutory registers, certificates).
5. Dashboards: owner home + ops board, vertical KPIs.
6. Report presets (the 10 reports that vertical's accountant asks for).
7. Compliance toggles (batch/expiry enforcement, sector license fields, register formats).
8. Sample-data sandbox tour ("see a day in a pharma shop").
9. Vernacular term map (the vertical's Hindi/regional trade vocabulary — e.g. "aadhat",
   "katauti", "bardana" in agri).
10. Migration mapping (what Tally/Marg/Busy masters become).

## 4. Switching & combining rules

- Enable any time; disable archives overlays (data retained read-only).
- Conflicts (two packs extending same field differently) resolved by pack priority +
  certification-time collision checks.
- A tenant's "industry" is thus a *set*: {retail-general, pharma-retail} models a
  supermarket with a pharmacy counter. This is the "switch as many industries as you want"
  requirement, delivered without forks.

## 5. Files in this section

Wave-1 packs get full spec files (01–05); wave-2/3 get combined outline files (06–08) that
expand to full specs when their wave starts.
