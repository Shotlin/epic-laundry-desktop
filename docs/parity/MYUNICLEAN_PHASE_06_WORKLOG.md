# MyUniClean parity Phase 6 — Catalogue and pricing

Status: **Partial**. The current 16-phase parity sequence is documented in
[`myuniclean-16-phase-execution-roadmap.md`](../myuniclean-16-phase-execution-roadmap.md).
This worklog is separate from the historical 12-phase implementation ledger
in `PHASE_STATUS.md`.

## Quick Add Garment / Catalogue Item

- Added a clearly labelled **Quick add garment** action beside garment search
  in Order & Billing. It is shown only to users with the existing
  `catalogue.manage` permission; other roles retain read-only Catalogue access.
- The dialog collects garment name/type, optional code, category/classification,
  unit, service, price, optional HSN code, and a bundled garment visual.
  Incompatible service/unit pairs cannot be selected. Duplicate names and
  existing or disabled price rules get an explanatory message.
- Save is explicit. The order builder preserves the customer and existing
  garment lines, refreshes the active catalogue, and adds the new priced line
  to the current draft. It never books an order or collects payment.
- The Save/Cancel row stays visible on mobile while fields scroll. Desktop and
  390 px captures are stored at
  `evidence/quick-add-garment-desktop.png` and
  `evidence/quick-add-garment-mobile.png`.
- The local server creates the garment and first price in one transaction,
  checks service/category/unit/price validity, and supports idempotent retry.
  A failed first-price check rolls the garment back. The connected-web adapter
  checks the active remote catalogue and can resume a matching garment if its
  price request failed; it never silently overwrites a different rule.

## Verification

- `webapp: npm run build` — passed.
- `server: npm run typecheck` — passed.
- `server: npm run test:catalogue` — passed; checks new item, inferred visual,
  retry reuse, price conflict, incompatible service/unit and transaction
  rollback.
- `server: npm run test:auth` — passed; checks owner create, same-key
  idempotent retry, immediate catalogue visibility, and counter-role 403.
- `webapp: npx playwright test e2e/booking-quick-add.spec.ts` — **2/2 passed**.
  The owner flow checked Cancel with zero Quick Add requests, then preserved a
  selected customer and existing line, added the new item to the draft,
  produced zero order writes and had no 390 px overflow.
  The counter view hid Quick Add. All browser data was held in Playwright's
  disposable SQLite workspace.
- A fresh authenticated MyUniClean review opened its populated Garment Pricing
  workspace without selecting, editing, deleting, saving, or exporting. It
  exposed separate garment, service, service-unit and status controls and
  price rows with category, special-pricing-customer and rate information.
  No live record values are retained here.
- The adjacent source Garments workspace has search and 100-row paging, a
  card/list presentation, and an Add Garment draft containing Name, Code,
  Category, existing-versus-new image choice and JPEG/PNG guidance. The draft
  was closed with Cancel; no file was chosen and no garment was saved. Epic
  already covers these fields with its owner-only garment editor, approved
  visual picker and local-image upload guard.
- The source Garment Pricing filters expose Service, Service Unit and Status;
  observed choices include All / Enabled / Disabled and Quantity / Kilogram /
  Sq.Ft / Pair. Legacy service labels mix casing and underscore/space forms.
  The source price Edit action opens a draft with Garment, Category, Service,
  Unit and Garment Price fields; it was not saved. Epic now presents service
  names in consistent title case in its pricing filter and price rows, while
  comparing normalized display labels and keeping the underlying service names
  and identifiers unchanged.
- Epic Store Settings now uses distinct `?view=pricing` and `?view=garments`
  destinations. Each announces the selected workspace and focuses the matching
  price-matrix or garment-library section; the price matrix also shows the
  garment category for every rule.
- A fresh read-only Categories review found eight source rows, a live
  case-insensitive search, page-size choices 10/20/50/100/500, a required
  100-character Add/Edit name field, and a pencil action that opens View before
  Edit. The source contains both `Household` and `HOUSE HOLD`; after filtering
  to one result its paginator still says `1–8 of 8`. Add and Edit drafts were
  cancelled, and no source category was changed or deleted. Epic already shows
  the filtered count accurately. Its category duplicate guard now treats case
  and spacing variants as the same name at both the form and server boundaries,
  preventing another `HOUSE HOLD` beside `Household` while preserving the
  existing saved labels. The category self-test and focused browser E2E now
  verify the server rule, blocked duplicate Save/no request, live search, empty
  state, and reversible status flow.
- A fresh read-only Services review found five active services, page-size
  choices 10/20/50/100/500, and a required 100-character name field in both Add
  and Edit. The pencil opens View Service before Edit Service. Search applies
  on Enter; searching `dry` shows only Dry Cleaning while the source count
  remains `1–5 of 5`, and a no-match search hides pagination entirely. Both Add
  and Edit drafts were cancelled, and the trash icon was not activated. Epic
  already searches as staff type, reports the filtered count, labels its row
  actions, shows active price-rule usage and provides reversible, guarded
  Switch off/Restore. Its search-empty state now also hides the unusable page
  controls in both Services and Categories. A fresh manual pass through the
  rebuilt app in an isolated demo workspace confirmed `steam` returns two
  services with `1–2 of 2`, `house` returns one category with `1–1 of 1`, and a
  no-match query removes the page-size/paging controls on both pages. Focused
  Categories and Services E2E passed 4/4 on the rebuilt bundle, including the
  category duplicate guard and empty-result controls. No live Add, Edit, Switch
  off or Delete action was committed.
- A fresh read-only Service Units review found four source units (Quantity,
  Kilogram, Sq.Ft and Pair), with no search box and page-size choices
  10/20/50/100/500. The source shows `1–4 of 4`; Add and Edit require a full
  name (100 characters) and short name (10 characters), and the row pencil opens
  View Unit before Edit. Both drafts were cancelled; the trash icon was not
  clicked. Epic already had the same fields and View→Edit flow, labelled
  reversible Archive/Restore controls, standard-unit protection and a usage
  guard. It lacked the source's result count and paging controls. Epic now uses
  the source page-size choices (default 100), reports `Showing 1–N of N`, and
  labels previous/next navigation. The isolated Playwright Service Units suite
  passed 2/2: safe Add/Edit/archive/restore behavior plus a 12-row page-size and
  navigation case; its mutations were intercepted. `npx tsc -b` and a fresh
  production Vite build passed. In production web mode, custom unit definitions
  are still saved in browser-local storage because no supported shared LNDRY
  Service Units endpoint has been confirmed; edits do not sync across devices.
- Read-only Store Charges review found three populated source cards and the
  `Items per page` control (10/20/50/100/500, default 100; `1–3 of 3`). The
  eye opens View Store Charge, whose explicit Edit Store Charge action opens a
  draft. Add/Edit exposes required name (50), Percentage/Amount, Express
  charge, required amount, and optional description (500); both inspected drafts
  were canceled. Store Discounts was empty, so only its Add draft could be
  mapped: required name (50), Percentage/Amount, amount, and optional
  description (200). Its draft was canceled. Epic already matches the field
  contracts and has readable labelled row actions, but both rule lists lacked
  source page sizing and navigation. They now use 100 by default, offer the
  same five page sizes and show accurate result counts with labeled paging;
  empty states omit nonfunctional page controls. A focused synthetic test passed
  for both 12-row lists, checking the five choices, counts, and page navigation
  without any write requests. Source delete icons were not activated, and no
  live rules or settings were changed.
- Latest `webapp: npm run build` — passed with TypeScript and normal minified
  Vite output. The full 119-test browser regression passed, including the
  Garment Pricing fixture with legacy `WASH & FOLD` and `DRY_CLEANING` labels;
  their display/filter normalization is browser-verified without catalogue
  writes.
- `settings-hub-navigation.spec.ts` and `catalogue-price-filters.spec.ts` passed
  in the complete browser run for both Settings deep links, focus context,
  pricing filters/paging, Category column and no-write boundaries.
- After adding the category name guard, the fresh Categories and Services
  E2Es passed 4/4. `server: npm run test:catalogue` passed with the
  duplicate-spacing case, and `server: npm run typecheck` passed. Full-suite
  category and service parity cases also pass.
- Windows desktop runtime and distribution builds passed. The phase remains
  Partial because connected-web persistence and the live source Garment Pricing
  row/status comparison still need external accounts.

## Remaining Phase 6 work

- Compare source Garment Pricing row-action semantics and exact status choices
  against an authenticated MyUniClean account. The separate populated rule
  list and distinct Settings destinations have now been checked.
- Inspect the source category delete result safely without confirming a
  deletion, and verify the category write path against a controlled connected
  test account. No live category has been changed or deleted.
- Inspect source service delete confirmation only if the trash action can be
  safely stopped before deletion; verify the connected-web service mutation
  path with an authorized test account. No live service has been changed or
  deleted.
- Verify the connected-web save/retry path against a controlled vendor test
  account; the current browser test exercises the local demo API only.
- Inspect source category/service/unit delete behavior only if it can be
  stopped before commit; verify connected-web catalogue writes against an
  authorized test account before calling their remote persistence complete.
- Complete source-vs-Epic role, empty/populated/error, theme and responsive
  review across Catalogue, Services, Categories, Units, Charges and Discounts.
- Resolve cross-device persistence for custom Service Units when LNDRY exposes
  a supported shared settings endpoint; browser-local storage remains explicit
  and visible to web users until then.

Quick Add is implemented and covered for the local app. Phase 6 remains Partial
until a controlled connected-web persistence/retry check can be completed;
destructive source actions remain deliberately outside this live audit.

## 3 October 2026 close-out update

- The restored read-only MyUniClean session reached **Garment Pricing**. It is
  an empty price matrix in this store, with Garment, Service, Service Unit and
  Status selectors, 100-row paging and disabled previous/next controls. The
  Service selector exposes both legacy and normalized labels; this confirms
  the existing Epic filter normalization without changing any source filter or
  price rule.
- **Store Discounts** remains empty. Its discarded Add draft confirms the
  50-character name and 200-character description limits and the two
  `Percentage` / `Amount` choices. **WhatsApp Message Templates** exposes four
  empty stages: Order Booked, Order Processing, Order Done and Order Delivered.
  Epic already has the same four safe stage tabs, previews and explicit
  save/archive boundaries.
- **Store Users**, **Store Packages**, and **Order No Series** were revisited
  read-only. Each is empty in this source store and exposes its labeled Add
  action with 100-row paging. Their existing Epic routes preserve the same
  operating entry points with clearer labels and reversible controls.
- Fresh local evidence passed: 8 focused Settings/Catalogue Playwright tests,
  `server npm run typecheck`, `test:catalogue`,
  `test:marketplace-cloud-catalogue`, and `test:marketplace-cloud-client`.
  The frontend production build passed as well. Tests used disposable or
  mocked data only.

The remaining external acceptance is intentionally narrow: a controlled
connected-vendor account is still needed to certify real remote persistence and
retry behavior. Source delete/save actions remain guarded because this is the
user's live MyUniClean workspace, not a test tenant.
