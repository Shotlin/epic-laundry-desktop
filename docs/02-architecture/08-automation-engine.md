# Automation Engine — Master Plan (the "best automation" layer)

> The system that makes Epic BOS feel alive: events fire actions, rules enforce policy, and
> AI agents propose — all human-approved. This is the layer that, *executed well*, makes us
> strictly more powerful than Odoo (Studio paid), ERPNext (server scripts), and AureusERP
> (no automation at all).
>
> Binds to: Event Bus (blueprint §5), Workflow Engine (platform-core §3), Customization Layer
> automations (platform-core §13), AI Gateway ([`06-ai-layer.md`](06-ai-layer.md)), Marketing
> journeys ([`13-extended-modules.md`](../03-modules/13-extended-modules.md) §2).

---

## 1. Thesis

**Best automation = declarative + programmable + AI-assisted + human-in-loop, native to every
module and every industry pack, running on the event bus.** Not a cron tab. Not a paid add-on.
Not a Python sandbox only developers can use.

Four promises:
1. **Any event can trigger any action** across modules — no code.
2. **Statutory rules are deterministic** (GST/TDS computed by rule engine, never by LLM).
3. **AI agents propose; humans dispose** — armed autopilot only where trust allows.
4. **Automations are data** — versioned, exported as Customization Sets, reviewed pre-upgrade.

---

## 2. The layered automation stack

```
L4  AGENTS      observer→decide→propose; permission-bounded; require arming
L3  FLOWS       multi-step: branch / wait / parallel / human-approval gate / error path
L2  ACTIONS     60+ types (see §4)
L1  CONDITIONS  expression language over fields + functions + ML signals
L0  TRIGGERS    domain event · schedule (cron-as-data) · webhook-in · field-watch
```

- **Event source:** every committed transaction emits a domain event via outbox
  (`sales.invoice.submitted.v1`). Automations, webhooks, AI, and integrations all subscribe.
  This is *real-time*, not poll-based — our edge over cron-driven competitors.
- **Scheduler:** cron-as-data, tenant-visible ("GSTR-1 reminder 8th"), idempotent, resumable,
  dead-letter queue, fairness caps (platform-core §9).

---

## 3. Conditions (the expression language)

A safe, sandboxed expression language over the record + context:
- Field comparisons, date/math, aggregations (`sum(invoices where overdue)`),
- Functions: `days_since`, `amount_band`, `is_gst_registered`, `ml_signal('churn_risk')`,
- Boolean combinations; evaluated server-side with the *actor's* RBAC context.
- Deterministic statutory conditions (e.g. "turnover > ₹5 Cr → enable e-invoicing") are
  computed by the rule engine, not LLM.

---

## 4. Actions (the 60+ vocabulary)

Grouped:
- **Record:** create/update/submit/cancel doc, set field, link records, clone.
- **Communication:** notify (in-app/push/email/SMS/WhatsApp), send template, start journey.
- **Money:** generate invoice, send payment link, initiate refund, run reconciliation pass.
- **Workflow:** transition state, assign approver, escalate, SLA timer.
- **Integration:** call webhook, push to connector (WA/payment/GSP), enqueue job.
- **AI:** invoke AI tool (`draft_document`, `match`, `classify`, `forecast`), queue for
  approval, auto-apply *only if* armed + confidence ≥ threshold.
- **Script:** run GraalVM sandbox script with capability tokens (platform-core §13).
- **Control:** branch, wait/delay, parallel, retry, stop-on-error, human-approval gate.

---

## 5. Flows & human-approval gates

Multi-step automations compose the above with:
- **Branching** (if/else on conditions), **wait** (delay or until event), **parallel** lanes,
- **Error path** (dead-letter + owner alert), **human-approval gate** (pause → inbox/WA →
  approve/reject → resume).
This is how a "quote → follow-up → remind → escalate → relist" sequence runs unattended but
never posts to a ledger without a sign-off.

---

## 6. Workflow & Approval Engine (stateful backbone)

From platform-core §3: metadata state machines (states, transitions, allowed roles,
conditions, actions) + approval matrices (amount × department × company, delegation,
escalation, OOO fallback). Industry packs override workflows declaratively (pharma adds
QC-release to GRN). Approvals surface in inbox, mobile, and **WhatsApp one-tap**.

---

## 7. AI Agents (the "destructive" differentiator)

Autonomous but bounded:
- **Observe** via event bus + read-only tool calls (RBAC-scoped, never raw DB).
- **Decide** using the AI Gateway (A1–A10 capabilities).
- **Propose** an action (draft entry, draft reply, reorder suggestion) into an approval queue.
- **Armed autopilot:** the *tenant owner* can arm specific agents ("auto-submit expense
  entries above 90% confidence, capped ₹2,000/day") — still logged, still reversible.
- **Self-learning per tenant:** accept/reject feedback trains few-shot preference profiles, not
  fine-tunes on customer data (AI layer §3).

This beats Odoo/ERPNext because their "automation" is either paid (Studio) or dev-only
(server scripts); ours is no-code, cross-module, event-native, and AI-augmented by default.

---

## 8. Industry Automation Packs (examples)

Each Industry Pack ([`04-industries/`](../04-industries/)) ships seed automations:
- **Retail/Distribution:** auto-reorder at reorder level, dead-stock alert > 90 days,
  scheme-margin recalc, payment-reminder dunning.
- **Pharma:** batch/expiry alert, QC-release gate on GRN, schedule-H audit trail, near-expiry
  discount trigger.
- **Services:** SLA escalation, idle-deal nudge, AMC renewal journey, timesheet auto-fill.
- **Manufacturing:** material-shortage alert, BOM-cost change propagation, maintenance due.
- **Field/Logistics:** NDR auto-reschedule, route-complete invoice trigger, fuel anomaly flag.
Packs are additive — automations from multiple packs coexist.

---

## 9. Governance & safety

- **Capability tokens** per automation/script (which entities/actions, rate limits).
- **Dry-run mode** + simulation ("show me what would happen") before enabling.
- **Full audit**: every automation run logged (trigger, conditions, actions, outcome).
- **Kill-switch** per capability and global; per-tenant AI budget caps.
- **Upgrade-safe:** automations are data; pre-upgrade diff reports conflicts (anti-Odoo).

---

## 10. "Automation density" KPI

Our north-star adoption metric: **automations live per active tenant** (seeded + custom).
Higher density = stickier OS. Track: events processed/sec/tenant, actions fired, human
approvals required vs auto-applied (armed), time saved estimate.

---

## 11. Phasing

- **Phase 0:** Event Bus outbox + trigger/condition/action core + Notification/simple record
  actions. Ship 10 seed automations.
- **Phase 1:** Flows (branch/wait/approval gate) + Workflow/Approval engine + WA approvals.
- **Phase 2:** AI agents (A1/A2/A4/A8 drafts→queue) + Industry Pack seed automations.
- **Phase 3:** Armed autopilot + self-learning profiles + predictive (forecast-triggered)
  automations.

---

## 12. Why this is the moat

Competitors treat automation as a feature. We treat it as **the operating system's nervous
system** — event-native, no-code, cross-module, AI-augmented, human-approved, and free in core.
That combination does not exist in any of the three references today.
