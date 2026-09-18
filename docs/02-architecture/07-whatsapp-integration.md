# WhatsApp Integration — Master Plan (the first-class surface)

> Companion to [`02-architecture/07-whatsapp-integration.md`](07-whatsapp-integration.md) is
> this. This document owns the *product + integration architecture* for WhatsApp. It is the
> surface ~80% of Indian SMB users will actually touch. **WhatsApp is not a channel bolt-on;
> it is a front-end.**
>
> Foundational contracts this plan binds to: Notification Bus (platform-core §8), Collaboration
> timeline (platform-core §5), Event Bus (blueprint §5), Marketing journeys
> ([`03-modules/13-extended-modules.md`](../03-modules/13-extended-modules.md) §2), AI copilot
> ([`02-architecture/06-ai-layer.md`](../02-architecture/06-ai-layer.md) A6).

---

## 1. Why WhatsApp is core, not optional

- 500M+ Indian users; for most MSMEs it *is* the CRM, the order book, and the support desk.
- A kirana / distribution / services business runs on: incoming order messages, payment
  reminders, catalog shares, approvals-on-the-go.
- **Design rule:** every record (lead, invoice, ticket, approval, delivery) has a WhatsApp
  thread attached to its collaboration timeline. Reply from WA → appears on the record.

---

## 2. Two integration paths (and how "your free WA tool" fits)

### Path A — WhatsApp Business Platform (Meta Cloud API / BSP)
Required for: **message templates** (outside 24h window), **product catalog**, **payment
links**, high volume, quality-rating compliance. This is the production path for scale.

### Path B — Your free WhatsApp integration software
You mentioned you already own a free WhatsApp integration tool. We do **not** hardcode to it.
Instead we hide it behind a provider-agnostic connector (§3) so:
- Today: we wire *your* tool as one `WhatsAppConnector` implementation.
- Tomorrow: we add Meta Cloud API / a BSP as a second implementation with zero product change.

> **Action for founder:** tell me the exact tool (e.g. WhatsApp Business app + a gateway,
> PyWhatsApp/WhatsApp Web library, a specific vendor). I will then fill the connector mapping
> in §7 precisely. The architecture below works for any of them.

---

## 3. Connector abstraction (the kernel contract)

```kotlin
interface WhatsAppConnector {
    fun sendTemplate(req: TemplateMessage): SendResult      // Meta-approved template
    fun sendFreeform(req: FreeformMessage): SendResult      // within 24h service window
    fun sendInteractive(req: InteractiveMessage): SendResult // buttons, lists, catalogs
    fun uploadMedia(file: MediaRef): MediaId
    fun markRead(wamid: String)
    fun subscribeWebhook(config: WebhookConfig)             // inbound messages/status
    fun resolveCustomer(phone: String): PartyRef?           // link to parties master
    fun health(): ConnectorHealth
}
```
Two implementations ship: `CloudApiConnector` (Meta) and `GenericFreeToolConnector`
(your tool — config-driven, no code change to switch). The rest of the product talks only to
the interface.

---

## 4. Inbound flow (message → record → action)

```
WA message → webhook → [Connector] → normalize
   → resolveParty(phone)            (create lead if unknown, consent-gated)
   → attach to record timeline      (collab service, ref_entity/ref_id)
   → emit event `wa.message.received`
   → Automations subscribe:
        • CRM: new lead / append to open deal thread
        • Helpdesk: open/append ticket (no lost messages)
        • Sales: parse order ("send 5 bori cement") → draft Sales Order (AI A8)
        • AI A6: draft reply, QUEUED for human approval (never auto-send)
```

---

## 5. Outbound surfaces (what we send over WA)

| Surface | Trigger | Template/Freeform | Notes |
|---|---|---|---|
| Lead capture reply | inbound msg | freeform | two-way thread on CRM |
| Invoice + payment link | `sales.invoice.submitted` | template | UPI/Razorpay link, pay-in-chat |
| Payment reminder | schedule / dunning | template | bilingual, with "pay now" button |
| Approval request | workflow state | interactive | one-tap Approve/Reject |
| Order confirmation | `sales.order.submitted` | template | ETA + track link |
| Delivery update | logistics NDR/webhook | template | "out for delivery" / reschedule |
| Support reply | ticket update | freeform | attaches to ticket |
| Owner daily digest | schedule 09:00 | template | sales/cash/discounts/cancels |
| Catalog share | ecommerce/marketing | catalog | WA product catalog sync |

All outbound routes through the **Notification Bus** (channel preference, quiet hours, digest
coalescing, per-tenant template library).

---

## 6. Compliance & trust (non-negotiable)

- **Consent / DPDP:** no WA message without an opt-in record per phone+channel. Imported lists
  must carry consent proof. Marketing honors DND/opt-out keywords (STOP, BLOCK).
- **24-hour rule:** freeform replies allowed only within 24h of last user message; otherwise a
  pre-approved **template** is mandatory. The connector enforces this automatically.
- **Template lifecycle:** templates authored + submitted for Meta approval *inside* the product
  (marketing §2); rejected templates block that surface with a clear error.
- **Quality rating:** monitor "blocked"/low-quality; auto-throttle and alert owner before Meta
  disables the number.
- **Human approval gate for AI:** any AI-drafted WA reply (A6) sits in an approval queue; only a
  human (or an explicitly armed autopilot rule) sends it. Blueprint §2.7.
- **PII:** message bodies are tenant-scoped, encrypted at rest, retained per policy, exportable.

---

## 7. Plugging in your free WhatsApp tool — connector descriptor

`shotlinXchat` is **WhatsAPI** — a Fastify + **Baileys** (WhatsApp-Web multidevice) backend.
That changes two things vs the Meta Cloud API path:

- **Freeform only.** Baileys is a WhatsApp-Web session, so there are **no Meta message
  templates, no product catalog, no native payment buttons**. All "rich" surfaces degrade to
  text/URL: we embed our own **UPI collect / Razorpay link** in the message body and render
  catalogs as an image/PDF. The 24-hour template rule does not apply the same way, but we still
  honor consent + rate limits.
- **QR login.** Connecting a number = scan a QR (`GET /qr`) from WhatsApp → Linked Devices.
  Perfect for SMBs; no Business API approval needed.

Filled connector descriptor (this is what `GenericFreeToolConnector` reads):

```yaml
whatsapp:
  connector: shortlinxchat-whatsapi        # your Free WA tool (Baileys/WA-Web)
  base_url: ${SHOTLINXCHAT_URL:-http://localhost:3000}
  auth:
    type: apikey                           # X-API-Key header (Bearer also accepted)
    header: X-API-Key
    token_env: SHOTLINXCHAT_API_KEY
  endpoints:
    send: /api/v1/send                    # 202 = queued via BullMQ
    send_direct: /api/v1/send/direct      # force immediate send
    media: /api/v1/media                  # send media from URL
    media_upload: /api/v1/media/upload    # multipart file upload
    media_image: /api/v1/media/image
    media_document: /api/v1/media/document
    messages_in: /api/v1/messages         # poll recent inbound
    status: /api/v1/status                # WA + queue health
    webhook_set: /api/v1/webhook          # tell tool to PUSH inbound to us
    qr: /qr                               # QR PNG/status for device linking
    health: /health
  inbound:
    mode: webhook_push                    # POST SHOTLINXCHAT_WEBHOOK_URL -> our /wa/ingest
    fallback: poll /api/v1/messages       # if webhook unset
  capabilities:
    templates: false                      # WA-Web: freeform text/URL only
    catalog: false
    interactive: false                    # no buttons/lists via WA-Web
    payment_link: false                   # we attach our own UPI/Razorpay URL in body
    media: true                           # image/video/audio/document
    read_receipts: false
    qr_login: true
  limits:                                 # honor the tool's own safety knobs
    rate_per_minute: ${SHOTLINXCHAT_RATE_LIMIT:-15}
    bulk_max_daily: 500
  mapping:
    to_field: to                         # E.164 WITHOUT '+', e.g. 919876543210
    body_field: message
    idempotency_field: idempotencyKey
    media_url_field: url
    media_caption_field: caption
```

**Wiring steps (Phase 0):**
1. Run `shotlinXchat` (`npm i && npm run dev`, Redis optional — direct mode fallback).
2. Scan `/qr` with the business WhatsApp → Linked Devices.
3. Set `SHOTLINXCHAT_WEBHOOK_URL=https://<epic>/api/wa/inbound` so inbound pushes to us
   (or poll `/api/v1/messages`).
4. Our `WhatsAppConnector` → `ShotlinXchatAdapter` maps the above 1:1. Freeform messages land
   on the matched Party timeline; AI draft replies queue for human approval before we call
   `/api/v1/send`.

> Repo: https://github.com/sayanm085/shotlinXchat — ISC licensed, Baileys-based. Note the
> disclaimer: WhatsApp-Web integrations carry ToS risk; keep volumes sane, honor opt-outs, and
> treat Meta Business API as the scale/enterprise escape hatch (both sit behind the same
> `WhatsAppConnector` interface).
If your tool lacks templates/catalog, the product automatically falls back to freeform +
our own UPI/Razorpay payment links + catalog rendered as image/PDF — so capability gaps in
the free tool never block a core flow.

---

## 8. Phasing

- **Phase 0 (kernel proof):** `WhatsAppConnector` interface + `GenericFreeToolConnector`
  skeleton + webhook receiver + `resolveParty` + attach-to-timeline. Smoke test: send a
  message from your tool → appears on a Party timeline.
- **Phase 1 (MVP):** CRM inbound capture + invoice/payment-link template + owner digest +
  Notification Bus WA channel. This is the "wow" for a services/retail SMB.
- **Phase 2:** approvals (one-tap), catalog sync, delivery/NDR updates, marketing journeys.
- **Phase 3:** AI A6 reply drafts (human-approved), multilingual voice→WA, autopilot rules.

---

## 9. Risks

- Free WA tool gets rate-limited / banned → `CloudApiConnector` is the escape hatch; design so
  the switch is config-only.
- Number sharing across staff → map WA identities to Epic users; one business number, many
  agents, full audit.
- Template rejections stall flows → per-surface fallback freeform + owner alert.

---

## 10. Success metrics

- % of daily business conversations happening *inside* Epic (not散 in personal WA).
- Lead→invoice conversion via WA vs web.
- Payment-link click-to-paid rate.
- Owner digest open rate (proxy for "does the OS talk to me where I am").
