# GST Engine (verified against 2026 regime; rules-as-data keeps it current)

## 1. Tax determination engine

Input: (supplier GSTIN state, place of supply, party type/registration, item HSN/SAC + rate
entry, transaction nature) → Output: tax rows (CGST+SGST | IGST | cess), RCM flag,
ITC-eligibility class.

Rules encoded as data:
- Place-of-supply matrix (goods vs services; bill-to/ship-to divergence; specific-service
  exceptions: immovable property, transport, events, OIDAR).
- Rate schedule by HSN/SAC with effective dates + conditional rates (restaurant regimes,
  textiles slabs); cess (compensation cess: tobacco/aerated/vehicles).
- Special regimes: composition (no tax collection, bill of supply, 1%/5%/6% turnover levy),
  SEZ (zero-rated with/without LUT), exports (LUT vs IGST-refund route), deemed exports,
  RCM catalog (GTA, advocate, sponsorship, unregistered imports of services, §9(3)/9(4)),
  ISD distribution, e-commerce operator TCS §52 and §9(5) categories.
- ITC classes: eligible / blocked §17(5) (vehicles, food, construction…) / proportional
  (exempt-supply rule 42/43 reversal) — captured at posting time so returns are projections,
  not month-end archaeology.

## 2. Master-data compliance

GSTIN validation (checksum + API verify with name match), HSN directory with search
(min 4/6-digit rules by turnover — enforced per profile), auto-HSN suggestion (AI, confidence
-gated), party return-filing status surfaced (defaulting suppliers flagged at PO time —
"unka 3B pending hai, aapka ITC risk hai").

## 3. E-invoicing (IRP)

- Applicability by profile (aggregate turnover > ₹5 Cr — threshold as data; auto-alert as
  tenant approaches: A3).
- On submit: build IRP payload (INV-01 schema, versioned), sign via GSP → IRN + signed QR →
  stamped onto invoice artifact (WORM archive of signed JSON).
- **30-day reporting window** (≥₹10 Cr AATO, FY26): hard countdown on unreported submitted
  invoices; block-or-warn policy per tenant.
- Failure UX: IRP down/rejection queue with reasons in plain language, retry with backoff,
  legal-fallback guidance; amendments/cancellation windows (24h cancel; else credit note).
- Covers: B2B, exports, SEZ, deemed exports, credit/debit notes; B2C dynamic-QR readiness
  (>₹500 Cr rule) as toggle.

## 4. E-way bill

Auto-trigger on movement documents (delivery note/invoice/challan/inter-GSTIN transfer)
above threshold (₹50k default; state overrides as data). Part-A/Part-B split flows,
transporter ID, vehicle updates, consolidated EWB, extension flows (validity by distance
slabs), Ship-to-GSTIN capture (2026 validation), cancellation windows. Trip linkage for
`logistics-transport` pack.

## 5. Returns engine

- **GSTR-1/IFF:** projected live from posted invoices (B2B/B2CL/B2CS/CDNR/exports/HSN
  summary Table 12 with 4/6-digit enforcement/doc series); diff-vs-e-invoice-autopop view;
  GSP push or JSON export.
- **GSTR-3B:** auto-drafted from GSTR-1 projection + ITC register + RCM self-invoices;
  cash/credit ledger fetch; challan creation assist (PMT-06).
- **GSTR-9/9C:** annual rollups with books-vs-returns diff workpapers.
- **QRMP:** quarterly filing + monthly IFF/PMT-06 handling by profile.
- CMP-08 (composition), GSTR-7/8 where applicable (TDS-GST deductors, e-comm operators —
  packs enable).
- Books-vs-filed diff ledger: any backdated posting after filing lands in a "unfiled
  delta" register (accounting §6 ugly case) so the next period reconciles.

## 6. ITC & IMS (the daily-work moat)

- **GSTR-2B ingestion** (monthly statement) + **IMS live inward invoices**: match against
  purchase register — exact / fuzzy (invoice no. normalization, ±dates, rounding) /
  missing-in-books / missing-in-2B buckets (AI-assisted A2 with reason codes).
- IMS actions (accept / reject / pending) pushed via GSP, with safeguards: pending-aging
  alerts, auto-accept rules (threshold + trusted supplier), reject-with-reason templates
  to supplier (WA/email — "aapka invoice reject hua, GSTIN galat hai").
- ITC risk ledger: provisional vs confirmed ITC, 180-day payment rule tracker (ITC reversal
  if supplier unpaid 180 days — auto-alarm from payables aging), supplier-notfiled exposure.
- Vendor communication automation: monthly "aapke invoices 2B me nahi aaye" chase list —
  the single most begged-for CA feature.

## 7. Invoice numbering & documents

Series rules per GST law (≤16 chars, unique per FY, alphanumeric+/-) enforced by numbering
service (platform-core §6); gapless option; document types: tax invoice, bill of supply,
receipt/refund voucher (advances), self-invoice (RCM), delivery challan (job-work/
inter-GSTIN), export invoice with FIRC linkage. Offline POS provisional→statutory series
rules (tech-stack §7) legally vetted: provisional refs never printed as tax invoice number.

## 8. Golden-file test policy

Every schema (INV-01, GSTR-1/3B JSONs, EWB payloads, IMS actions) has versioned fixture
suites: rate boundaries, RCM, SEZ, exports, CDN edge cases, rounding (paise), amendments.
A statutory data update cannot merge without green goldens + a changelog entry the support
team can read aloud to customers.
