# MyUniClean parity — Phase 15: Epic-only features and simple discovery

**Status: Partial.** Epic-specific functions remain in the product; this phase checks whether staff can find them by their work and whether the route labels are clear. It does not claim that every Epic-only control has passed full workflow verification.

## Inventory reviewed

- **Operations:** seven labeled workstreams link order pipeline, production queue, garment tracking, quality/exception work, pickup and delivery, route runs, and documents/tags.
- **Finance & compliance:** finance command centre, statutory controls, cash closing, settlements, expenses, payment/report surfaces, store setup, and correction documents.
- **Business controls:** workforce/management, finance setup, online and marketplace orders, marketplace catalogue/sync/platform controls, reports, catalogue, imports, and settings.
- **Customer programs:** care packages and related customer/order journeys.
- **Main workspace navigation:** 34 unique destinations across Home, Counter, Production, Pickup & delivery, Finance & compliance, Customer programs, and Business controls.

The Operations and Finance cards use task descriptions and labeled action links. The Operations hub screenshot was inspected at desktop and 390 px; its seven cards route to the declared workspaces. The finance hub presents statutory health, evidence gaps and actual linked work areas without claiming unverified filing or provider success.

## Change made

The sidebar listed **Captain settlements** under both Pickup & delivery and Finance & compliance. The duplicate entry was removed from Pickup & delivery and retained under Finance & compliance. Dispatch and route runs remain in Pickup & delivery; the Finance hub retains its contextual settlement card. This gives the route one home in the persistent rail while preserving a contextual path for finance users.

The Settings review found that these are distinct source concepts: **Garment Pricing** opens the rate workspace, while **Garments** opens the master garment list. Epic now preserves that distinction without changing its brand or overall layout. `Garment pricing` links to `Catalogue?view=pricing`, while `Garments` links to `Catalogue?view=garments`; the chosen section is focused and announced to keyboard and screen-reader users. The price matrix now includes Category, matching a visible reference record field. No source setting was changed.

## Verification

- `webapp`: `npx playwright test e2e/operations-hub-navigation.spec.ts` — **1/1 passed**.
- `webapp`: `npx playwright test e2e/sidebar-navigation.spec.ts` — **1/1 passed** after the route change; all 34 destinations resolve, and the settlement link is present exactly once after expanding its group.
- `webapp`: `npx playwright test e2e/settings-hub-navigation.spec.ts e2e/catalogue-price-filters.spec.ts` — **2/2 passed**. It checks both Settings catalogue destinations, focus context, pricing filters and no-write behavior.
- Desktop and 390 px Operations hub captures were visually inspected; the updated expanded desktop navigation capture is `evidence/navigation-workstreams-desktop.png`.
- Sidebar navigation's dedicated test confirms destinations and uniqueness; it does not prove each role's card visibility or every linked workflow's complete data behavior.
- The 2 October full isolated Playwright regression passed **119/119** in one
  temporary SQLite workspace. It includes role access, all-route visual and
  compact-width checks, dark theme, accessible button labels, Settings,
  reports, expenses, cash closing, packages, and offline recovery. It did not
  write to the installed user's database or MyUniClean.

## Remaining work before Complete

- Review every finance, management, marketplace, statutory, package, and offline-only control by staff task, permission, read/write boundary, and recovery path.
- Verify cards and navigation for owner, counter, processing, and rider roles, including narrow navigation and supported themes.
- Teach the purpose and next step for Epic-only functions with plain task language and visible confirmations; compare with MyUniClean only where a matching source function exists.
- Complete live source comparison and connected-vendor persistence/retry checks
  after MyUniClean is authenticated and an authorized non-production vendor is
  available. These external checks are not inferred from local demo behavior.

See the [16-phase roadmap](../myuniclean-16-phase-execution-roadmap.md), [master parity matrix](MASTER_PARITY_MATRIX.md), and [known verification gaps](NEEDS_VERIFICATION.md).

## 3 October 2026 close-out update

The restored source session was used only to revisit the matching Settings
surfaces. Garment Pricing, Store Discounts, message templates, Store Users,
Store Packages, and Order No Series all use the same familiar labelled entry
points that Epic exposes from Settings. No confirmed navigation, icon, or
workflow gap was found, so the Epic brand and layout were kept intact.

Eight focused Settings/Catalogue browser checks passed, including pricing,
discounts, templates, Store Users, Store Packages, and order-number series.
The remaining Phase 15 limits concern Epic-only workflows and real connected
vendor persistence, neither of which can be certified from a local demo or a
read-only source account.
