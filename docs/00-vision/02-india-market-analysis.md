# India Market Analysis

> Directional figures for strategy; refresh with primary research before fundraising.
> Sources: MSME Ministry/Udyam registrations, GSTN statistics, NPCI data, public vendor
> disclosures (as of early 2026).

---

## 1. Market structure

- **63M+ MSMEs**; Udyam-registered crossed ~50M (2025). Micro ≈ 97%, Small ≈ 2.7%, Medium <0.5%.
- **~14–15M active GST registrants** — the real addressable core (businesses with mandatory
  digital compliance needs). E-invoice mandate (>₹5 Cr turnover) covers ~1M+ entities and the
  threshold trend is downward → compliance software demand compounds by regulation.
- **UPI**: 500M+ users, ~₹20L Cr+/month; B2B acceptance universal → "UPI-native receivables"
  is a mainstream feature, not niche.
- **WhatsApp**: 500M+ Indian users; the de-facto SMB CRM/communication layer.
- Smartphone-first: majority of owners' primary computing device is Android < ₹15k.

## 2. Segmentation & serviceable market

| Segment | Count | Today's stack | Our entry |
|---|---|---|---|
| Micro retail/services (< ₹40L) | ~50M | Paper, Vyapar, Khatabook | Free tier: invoice + UPI + khata |
| GST-registered SMB (₹40L–5Cr) | ~10M | Tally + Excel + WhatsApp | Core wedge: compliance cockpit + CRM |
| E-invoice mandated (> ₹5Cr) | ~1M | Tally Prime + point tools / Busy / Marg | Full BOS replacement, migration pack |
| Mid-market (₹50Cr–500Cr) | ~150k | SAP B1, Dynamics, Oracle NetSuite, ERPNext | v2 target: multi-entity, manufacturing depth |

SAM (realistic 5-yr): ~3M businesses × ₹8–40k/yr ARPU ⇒ **₹5,000–8,000 Cr ($0.7–1B) annual**
software spend in reachable segments; expanding with mandates.

## 3. Pain map (what actually hurts, per persona)

**Owner (decision maker):** no single truth ("kitna paisa aayega is mahine?"), fear of notices,
staff fraud anxiety, data hostage in accountant's Tally, English-only tools.
**Accountant/CA:** GSTR-2B reconciliation drudgery, IMS actions, client data collection chaos,
year-end audit trail gaps.
**Operations/staff:** stockouts vs dead stock, manual order-taking on WhatsApp → re-typing,
delivery tracking on calls.
**HR:** attendance chaos, PF/ESI/PT calculation fear, payslip demands.

## 4. Why now (timing thesis)

1. **Regulatory forcing function:** e-invoicing threshold trajectory, IMS (hard-locks ITC to
   reconciliation behavior), 30-day IRP reporting window (FY26), HSN validation tightening,
   MCA audit-trail mandate — compliance is becoming continuous, not monthly. Tally's
   file-based, offline architecture strains here; cloud-native wins.
2. **AI capability step-change:** document extraction + vernacular voice now actually work —
   the data-entry barrier (the #1 reason SMBs don't adopt ERPs) is finally solvable.
3. **Rails matured:** UPI ubiquity, account aggregator framework for bank feeds, WhatsApp
   Business APIs, ONDC — integration surface that didn't exist when Odoo/ERPNext were designed.
4. **Talent & cost:** India engineering talent + open-source references = the build is
   feasible at startup cost (research docs 01-research/* de-risk the architecture).

## 5. Adoption barriers (design answers required)

| Barrier | Our answer |
|---|---|
| "Tally hai na" inertia; CA ecosystem loyalty | Tally migration pack + **CA Partner Program** (free CA console, multi-client cockpit) — make CAs the channel, not the enemy |
| Data-entry aversion | AI capture (bill photo → entry), WhatsApp bot entry, voice entry |
| Trust (cloud fear, data hostage fear) | Self-host option, full export, India residency, audit log, offline tolerance |
| Price sensitivity | Free compliant single-user tier; paid starts ₹299–499/mo; no per-invoice tax |
| Power cuts / patchy internet | Offline POS/field apps; store hub |
| English UX | 12 languages, voice, icon-first design (07-ux-design/04) |

## 6. Channel model (summary; detail in 08-delivery/04)

CA/accountant partner program (primary) · device+POS resellers · marketplace/ONDC ecosystem ·
industry associations (CAIT, trade bodies) · content-led (GST literacy in vernacular) ·
freemium self-serve.
