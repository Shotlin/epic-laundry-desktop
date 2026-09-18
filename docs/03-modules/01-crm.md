# Module Spec: CRM

## 1. Job-to-be-done
"Koi enquiry miss na ho, har follow-up time pe ho" — capture every lead from every channel,
work it in a pipeline, convert to a quote/order without re-typing anything.

## 2. Entities
Masters: `lead_source`, `pipeline`, `stage`, `lost_reason`, `territory`, `sales_team`.
Documents: `lead` (unqualified), `opportunity` (qualified, staged), `communication`
(logged calls/emails/WA), `campaign_touch`. Links into `party` on conversion (no duplicate
customer master — principle 2).

## 3. Core flows
- **Capture:** WhatsApp / IndiaMART / JustDial / website form / missed-call number / QR /
  business card scan (AI) / walk-in (POS prompt) → `lead` with source attribution + instant
  auto-reply + assignment rule (round-robin / territory / load).
- **Work:** kanban pipeline; every card shows next activity or screams "no next step" (red).
  Timeline merges calls (telephony connector), WhatsApp thread, emails, notes, quotes.
- **Convert:** one tap → party + opportunity → quotation (sales module takes over); loss →
  mandatory `lost_reason` (fuel for owner analytics).
- **Nurture:** no-order-in-N-days segments feed marketing journeys (v2).

## 4. Feature ladder
- **MVP:** leads, pipeline kanban, activities, WhatsApp-first capture + reply, mobile app
  parity, assignment rules, duplicate detection (phone/GSTIN fuzzy).
- **v1:** telephony integration (click-to-call, recording on record), email sync, quote from
  chat, team targets vs achievement, territory mgmt, meeting scheduler links.
- **v2:** AI lead scoring + next-best-action (A6), reply drafting, visit check-in with geo,
  route planning for field sales day, forecast rollups.

## 5. Ugly cases
Duplicate leads across channels (same person, 3 numbers) → merge tooling with audit; leads in
Hinglish voice notes → AI transcription draft; sales rep exits → one-click territory/owner
reassignment with history intact; WhatsApp number changes; B2B buying committee (multiple
contacts per opportunity, roles).

## 6. India notes
WhatsApp is the pipeline for most SMBs — CRM without deep WA (templates, catalogs, payment
links, thread-on-record) is dead on arrival. IndiaMART/TradeIndia lead APIs are wedge
integrations. Missed-call + IVR capture patterns still matter in tier-2/3.

## 7. AI assists
A6 (scoring, drafts), A8 (voice lead entry), dedupe suggestions, conversation summarization
("last 6 months with this customer in 5 bullets").

## 8. KPIs
Lead response time (median), pipeline by stage/owner, conversion % by source, lost-reason
pareto, activities overdue, forecast vs target.
