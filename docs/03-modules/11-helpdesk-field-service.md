# Module Spec: Helpdesk & Field Service

## 1. Job-to-be-done
Every complaint/service request tracked to resolution (no lost WhatsApp messages), and every
field visit scheduled, executed, and billed — with AMC renewals never missed.

## 2. Entities
**Helpdesk:** `ticket` (omnichannel: WA/email/portal/phone/QR), `sla_policy` (response/
resolve targets by priority/customer tier), `canned_response`, `csat_survey`,
`knowledge_article` (deflection).
**Field service:** `service_visit` (scheduled job: install/repair/PM), `service_contract`
(AMC/warranty: covered items by serial, entitlements, renewal), `technician` (skills, zone),
`spare_consumption` (stock issue from van warehouse), `service_report` (customer-signed).

## 3. Core flows
- **Ticket:** capture → auto-categorize + assign (rules/AI) → SLA timers with escalation →
  conversation on record (customer sees portal/WA thread) → resolve → CSAT ping.
- **Ticket → visit:** field-eligible tickets spawn visits → dispatch board (map + calendar,
  skill/zone matching) → technician app (offline): job details, serial history, checklist,
  photos, spare consumption (van stock), OTP/signature completion → auto invoice (labor +
  spares, warranty/AMC entitlement applied) → payment collection (UPI on device).
- **Contracts:** AMC sale → PM visit auto-scheduling across period → renewal pipeline 60/30/7
  days (CRM link).

## 4. Feature ladder
- **v1:** tickets (WA/email/portal), SLA + escalations, assignment rules, canned responses,
  merge/split, service visits + technician mobile app (offline), AMC contracts + renewals,
  spares from van stock, visit invoicing.
- **v2:** dispatch optimization (route clustering), IoT-triggered tickets, warranty claim
  handling with vendors, CSAT analytics, knowledge-base deflection with AI answers (A10),
  customer asset registry (installed base by serial with full service history).

## 5. Ugly cases
Same issue reported thrice on three channels (dedupe/merge); technician offline all day in a
basement (sync); spare consumed but not in van stock (negative-stock exception flow);
AMC covering 40 machines at 12 sites with different PM frequencies; billing warranty-void
scenarios (customer dispute trail); SLA clock across holidays/business hours per branch.

## 6. India notes
Appliance/equipment AMC economy is massive (AC, RO, lifts, DG sets, medical devices). OTP
completion + geo-stamped visit proof reduce "visit hua hi nahi" disputes. Spare-part GST
(goods) + service labor (SAC) split invoicing handled natively.

## 7. AI assists
Auto-triage + priority prediction, reply drafting, similar-ticket surfacing, visit-notes
voice-to-report, deflection bot on portal/WA.

## 8. KPIs
First-response/resolution times vs SLA, ticket volume by category, CSAT, first-visit-fix
rate, technician utilization, AMC renewal rate, spare consumption vs billing leakage.
