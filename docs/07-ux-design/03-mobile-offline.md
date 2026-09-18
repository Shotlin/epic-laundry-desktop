# Mobile & Offline Strategy

## 1. App portfolio (Flutter; arch 01 §3)

| App | Users | Offline class |
|---|---|---|
| **Epic POS** | Cashiers, restaurants | Full offline (class A) |
| **Epic Field** | Sales reps (beats), delivery, technicians | Full offline (class A) |
| **Epic Owner** | Owners/managers | Cached-read + queued-approve (class B) |
| **Epic People** | All employees (ESS) | Cached-read (class C) |
| Web responsive | Accountants, back office | Online-first |

One Flutter monorepo, shared core (sync engine, design tokens, auth, printing), app shells
per persona — not one mega-app (role clarity, store review isolation, size budgets).

## 2. Offline classes

- **Class A:** local SQLite replica of working set (catalog, prices, parties, own drafts,
  routes/jobs); create-only documents offline (immutability makes conflicts tractable —
  tech-stack §7); provisional numbering; queue with per-doc sync status UI (pending/synced/
  attention). Working set scoping: POS terminal = its warehouse+price list; field rep = his
  beat parties + van stock. Size budget <200MB typical.
- **Class B:** KPI snapshots + approval queue cached; approvals executed offline are queued
  with optimistic UI + rollback toast on server rejection.
- **Class C:** read caches (payslips, balances), all writes online.

## 3. Sync engine UX rules

Never block work on sync; never hide sync truth (status chip always one tap away); conflict
surfacing in human terms ("HQ ne rate badla jab aap offline the — naya rate ₹142 lagega")
with clear precedence rules; multi-day offline tested (3-day mandi scenario in QA suite);
battery/data respectful (delta sync, wifi-preferred media upload).

## 4. Device & hardware reality

Min spec: Android 8 / 2GB RAM; thermal printers via ESC/POS (BT/USB/LAN), Sunmi/Rockchip
POS terminals certified list; barcode via camera (ML Kit) + HID scanners; weighing scale
serial protocols (retail pack); UPI soundbox coexistence; biometric devices (attendance)
via vendor SDK bridge service (LAN push to server).

## 5. WhatsApp as a surface (not just a channel)

Owner/CA interactions without app install: daily digest, approval cards (button replies),
invoice/payment-link share, document collection ("apna bill photo bhejo" → AI draft), lead
capture bot, reminder conversations. Guardrails: template compliance, opt-out honor,
session-window rules — the WA surface is a first-class client with its own journey specs.
