# epic-bos-server — Phase 0 kernel

The runnable foundation of Epic BOS: a metadata-driven **Schema Registry**, **posting engine**,
**event outbox**, **audit log**, and a **WhatsApp connector** to the founder's `shotlinXchat`
(WhatsAPI). Built in Node.js + TypeScript (Fastify) per ADR-002 (Kotlin/Spring is the hardened
production port target).

## Run
```bash
npm install
cp .env.example .env      # edit SHOTLINXCHAT_URL / API key if needed
npm run dev               # or: npm start
```
- API:        http://localhost:3001/api/health
- Control UI: http://localhost:3001/ui/
- Data:       ./data/epic.json (JSON snapshot; no external DB needed for Phase 0)

## What it proves (architecture from docs/)
1. **Schema Registry** — `sales_invoice` is defined as *metadata*; CRUD + submit + API + audit
   are generated, not hand-written (zero entity-specific UI code for the data layer).
2. **Posting engine** — submitting an invoice appends immutable GL entries
   (Dr Debtors = Cr Sales + Cr Output GST). Cancel posts a reversal, never a delete.
3. **Event bus + outbox** — submit emits `sales_invoice.submitted.v1`; internal subscribers
   (automations) and external consumers (webhooks/search/AI) both drain the outbox.
4. **Audit trail is physics** — every create/submit/cancel/WA event is recorded.
5. **WhatsApp surface** — `WhatsAppConnector` → `ShotlinXchatAdapter` sends invoice links /
   notifications over the founder's free WA tool (freeform; we attach our own UPI/Razorpay link).

## Wire your WhatsApp (shotlinXchat)
```bash
git clone https://github.com/sayanm085/shotlinXchat && cd shotlinXchat
npm install && npm run dev      # scan the QR at http://localhost:3000/qr
# then tell Epic where to receive inbound + send a test:
curl -X POST http://localhost:3001/api/wa/webhook -H "X-API-Key: dev-key-change-me"
curl -X POST http://localhost:3001/api/wa/send -H "X-API-Key: dev-key-change-me" \
  -H "Content-Type: application/json" -d '{"to":"919876543210","message":"hi from Epic BOS"}'
```
When `shotlinXchat` is up and an invoice is submitted, the seed automation notifies the
customer on WhatsApp automatically.

## Next
Phase-1 MVP per `docs/08-delivery/00-roadmap.md`: GST engine, e-invoice/e-way, POS, CRM, and
the full 43-module surface — all generated from the same metadata engine proven here.
