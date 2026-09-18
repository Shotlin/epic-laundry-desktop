# Design Language — "Epic DS"

## 1. Personality
Trustworthy calm (this app holds your money) + Indian warmth (not Silicon-Valley sterile).
Dense-capable but never dense-by-default. Odoo's friendliness, Linear's crispness, bank-app
seriousness on money screens.

## 2. Foundations
- **Color:** primary deep indigo (trust) + saffron accent (action/energy); semantic set
  (success/warn/danger/info) tuned for AA on low-quality panels; money-negative always
  paired icon+color (color-blind safe). Full dark mode (POS night shifts).
- **Type:** Inter (Latin) + Noto Sans family (Devanagari, Tamil, Telugu, Bengali, Gujarati,
  Kannada, Malayalam, Gurmukhi, Odia) with per-script line-height compensation; tabular
  numerals mandatory on all amounts; ₹ formatting lakh/crore grouping (1,23,45,678.00) with
  Western toggle.
- **Grid/density:** 4px base; comfortable/compact/dense user modes (accountants live in
  dense); touch targets ≥44px on mobile surfaces.
- **Iconography:** outline set + domain glyphs (godown, challan, mandi, QR, e-way truck);
  never icon-only for money actions.

## 3. Component tiers
1. Primitives (Radix-based): buttons, inputs, dialogs, toasts, tables.
2. **Business components** (the real design system): AmountInput (lakh/crore aware),
   PartyPicker (search by name/phone/GSTIN with verify badges), ItemPicker (barcode/voice/
   fuzzy vernacular), TaxBreakupCard, StatusPill (lifecycle-aware), AgingBadge,
   DocumentTimeline (chatter), ApprovalStrip, GSTINField (checksum+lookup), QRPayBlock,
   SeriesBadge, PeriodLockBanner, ComplianceLight.
3. View renderers: schema-driven Form/List/Kanban/Calendar/Pivot/Chart (arch 01 §2) — one
   renderer improvement upgrades every module screen.

## 4. Screen archetypes (every module maps to these six)
- **Home (persona dashboard):** owner sees KPIs + actions; clerk sees work queues.
- **List+views:** saved filters, bulk actions, column prefs per user.
- **Record:** header (status, key figures, smart-relation buttons Odoo-style) + tabs +
  timeline rail.
- **Workbench:** high-frequency split-pane operations (reconciliation, matching, review
  queues, POS) — keyboard-first, sub-100ms interactions.
- **Wizard:** onboarding, filing flows, migrations — one decision per step, progress saved.
- **Cockpit:** cross-module status walls (compliance, cash, production) — glanceable,
  drill-anywhere.

## 5. Interaction grammar
⌘K everywhere (search + actions + create); Enter-chains optimized for numeric entry
(voucher entry speed parity with Tally is a hard requirement — measured); undo-toast over
confirm-dialog for reversible acts; destructive/statutory acts get typed confirmation;
every AI suggestion visually distinct (sparkle border) + always dismissible; empty states
teach (sample data + 30-sec clip + "create first X" CTA).

## 6. Content voice
Plain language over jargon ("paisa aana hai" beats "receivables" in Hindi UI; English UI
keeps standard terms with tooltips); numbers humanized (₹1.2L, ₹3.4Cr) with exact on hover;
errors say what to do next, never stack traces; celebratory moments (first invoice, filing
done) tasteful, silenceable.
