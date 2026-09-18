# Corporate & Regulatory Umbrella

## 1. MCA / Companies Act (for Pvt Ltd / LLP tenants)

- **Audit-trail rule (Companies (Accounts) Rules):** books software must log every change
  with who/when and cannot allow edit-log disablement → satisfied structurally: immutable
  postings + kernel audit log + tamper-evident chain (arch 02 §11, arch 05). We publish an
  auditor-facing "audit trail attestation" document per release (CA firms ask).
- Books retention 8 years; backup-in-India requirement for cloud books → India residency
  default (arch 03 §3).
- Schedule III statement exports, CARO-support reports (asset verification, 43B(h) MSME
  dues, statutory-dues regularity), related-party transaction register (flag from party
  master relationships), DPT-3/MSME-1 data preps.
- Director/KMP masters with DIN, board-meeting minutes vault (documents module) — CS-lite
  convenience, not a compliance engine claim.

## 2. DPDP Act (Digital Personal Data Protection)

We are Data Fiduciary for our tenant data AND Data Processor for their customers' data:
- PII tagging in Schema Registry drives consent purposes, masking, retention, erasure
  (arch 05 §4); consent registry UI for marketing channels (module 13 §2).
- Erasure vs statutory-retention resolver: ledger-embedded names survive (legal basis),
  marketing/behavioral data purges.
- Breach runbooks + notification templates; Data Protection Officer contact surface;
  children's-data guards (education pack: parental consent flows).
- Cross-border: external AI provider calls gated by tenant consent + redaction (arch 06 §3).

## 3. MSME ecosystem

- Udyam registration capture for tenant AND vendors; **43B(h) engine:** payables to MSME
  vendors aging against 15/45-day limits → deduction-loss warnings, MSME-1 return data,
  interest-liability computation (MSMED Act 3× bank rate) — CFO-grade pain solved natively.
- Delayed-payment recovery assist: Samadhaan portal document pack generation.

## 4. Sector licenses (pack-provided, platform-tracked)

License registry with expiry alerts + renewal checklists: FSSAI (food), Drug Licenses
(pharma), BIS/ISI, Legal Metrology (packaged goods MRP declarations), shops & establishment,
factory license, pollution consents (CTE/CTO), excise (liquor), IEC (exporters), RERA
(builders), clinical establishment (healthcare). Each pack seeds its set; cockpit shows a
unified "licenses" lane.

## 5. Cash-transaction guardrails (advisory engine)

Warnings-as-you-type (never silent blocks; owner can proceed, log notes): 40A(3) cash
expense >₹10k/day/payee; 269ST receiving ≥₹2L cash per event; 269SS/T cash loans ≥₹20k;
SFT thresholds; TCS-on-cash rules where applicable; composition-scheme boundary tracking
(₹1.5Cr). Rationale shown in plain vernacular ("isse aapko 100% tax penalty lag sakti hai").

## 6. Import/Export (phase-2 depth)

IEC on profile; export invoices with shipping-bill/FIRC linkage, LUT registry, GST refund
data packs (RFD-01 workpapers), AD-code registry, RoDTEP/drawback tracking-lite; import:
BoE capture with IGST credit linkage + landed cost (purchase module §4).

## 7. The Compliance Cockpit (product surface tying it all)

One screen, four lanes: **File** (returns due w/ amounts), **Fix** (mismatches: 2B, 26AS,
books-vs-filed deltas), **Watch** (thresholds approaching: e-invoice mandate, composition
ceiling, 43B(h) breaches), **Licenses** (expiries). Each item: rupee impact, deadline,
one-tap action, "send to my CA" share. Weekly WhatsApp digest in tenant language. This
screen is the demo that closes sales.
