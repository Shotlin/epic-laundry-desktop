# Epic BOS — Business Operating System

An India-first, multi-industry **Business Operating System** (ERP + CRM + HR + POS + India
compliance + AI) that hybridizes [AureusERP](https://github.com/aureuserp/aureuserp),
[ERPNext](https://github.com/frappe/erpnext), and [Odoo](https://github.com/odoo/odoo), plus
the founder's own WhatsApp tool [shotlinXchat](https://github.com/sayanm085/shotlinXchat).
Clean-room, docs-first, then executed.

## What's in this repo

| Path | What |
|---|---|
| `docs/` | **The plan** — 60 spec docs, master index `docs/README.md`. Start here. |
| `server/` | **Phase-0 kernel** (Node/TS/Fastify): Schema Registry, posting engine, event bus, audit, WhatsApp connector. **Runnable now.** |
| `desktop/` | **Electron** shell (Win/Mac/Linux) wrapping the control UI. |

## Quick start (run it)
```bash
# 1) build the counter UI (generated output is intentionally not committed)
cd webapp && npm install && npm run build
# 2) backend kernel
cd ../server && npm install && npm start
# 3) (optional) WhatsApp — clone + run shortlinXchat, scan QR, then:
#    curl -X POST http://localhost:3001/api/wa/webhook -H "X-API-Key: dev-key-change-me"
# 4) desktop app
cd ../desktop && npm install && npm start
```
Open the control UI at http://localhost:3001/ui/ — create a Sales Invoice, Submit it, and watch
the GL ledger + audit populate. If `shotlinXchat` is running, the customer gets a WhatsApp.

## Writable sample workspace

For a complete local Laundry Desk with seeded customers, garments, prices and orders, double-click
`Start-EpicLaundry-TestWorkspace.cmd`. It starts the background server, waits for it to be ready,
and opens `http://127.0.0.1:3002/ui/app/?local-demo=1#/laundry/dashboard`.

Sign in with `demo` and `DemoLaundry!2026`. This account is an owner and can create orders. Its
records are isolated in `demo-runtime/local-demo.sqlite`; use **Sample workspace · reset** in the
app header whenever you want to restore the initial sample data.

## Laundry desk verification and operating guide

The [operator manual](docs/EPIC_LAUNDRY_USER_MANUAL.md) explains the dashboard, booking,
production, pickup/delivery, customer programs, reports and finance workflows.

From the repository root, after installing dependencies, run:

```bash
node scripts/verify-release-source.mjs server
node scripts/verify-release-source.mjs webapp
node scripts/verify-release-source.mjs desktop
cd webapp
npm run test:e2e
npm run test:e2e:empty
```

Browser regressions use temporary databases. Build the web application before starting
them and keep generated assets stable while the browser suite is running.

Publishing source to `main` does not certify a customer installer. The desktop production
release guard requires the approved version, Authenticode credentials, Ed25519 keys and
an HTTPS update feed. Remote vendor persistence and physical printing must also be
verified in an authorized test environment before customer distribution.

## The thesis
ERPNext's platform brain + Odoo's UX + AureusERP's skeleton + an **India-compliance heart** and
**AI-native, human-approved** automation none of them put in core. Full design: `docs/README.md`.

## Status
- Laundry desk: dashboard/overview, booking, store orders, production, routes,
  customer programs, reporting and configuration flows are implemented in this
  source tree. See [source verification and release gates](docs/parity/SOURCE_PUBLISH_2026-10-03.md)
  for the current distribution boundary.
- Planning: **complete (edition 3)**.
- Execution: **Phase 0 in progress** — kernel verified, GST engine built+tested, WhatsApp live-wired.
  - ✅ Kernel: invoice → GL posting (CGST/SGST/IGST) → audit → event bus (curl-tested).
  - ✅ **GST engine** (`server/src/modules/gst/`): CGST/SGST vs IGST split by place of supply,
    e-invoice payload, e-way bill, GSTR-1 projection, compliance cockpit — 9/9 self-test asserts pass.
  - ✅ **WhatsApp (shotlinXchat) wired live**: cloned + running on :3000, QR pending scan,
    webhook → Epic `/api/wa/inbound` set, outbound path authenticated & reaching the WA service
    (delivery completes once the QR is scanned on a phone).
  - ⏳ WhatsApp *delivery* + Kotlin/Spring port (ADR-002) pending.
- Key decisions: Desktop = Electron (ADR-003) · WhatsApp = shortlinXchat (ADR-004) ·
  Phase-0 backend in TypeScript, Kotlin/Spring retained as production port (ADR-002).
