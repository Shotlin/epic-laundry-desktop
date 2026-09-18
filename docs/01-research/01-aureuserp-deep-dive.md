# Research Deep-Dive: AureusERP

> **Repo:** https://github.com/aureuserp/aureuserp
> **Verified:** 2026-07-13 · v1.4.0 (2026-05-13) · ~11.4k stars · MIT license · 3,100+ commits
> **Vendor:** Webkul (also behind Bagisto e-commerce and Krayin CRM)

---

## 1. What it is

AureusERP is a modern, open-source ERP built on the **Laravel 13 + FilamentPHP 5** stack. It is
effectively an "Odoo re-imagined in PHP/Laravel" — the plugin names, data flows, and UX patterns
map almost one-to-one to Odoo community modules, but the implementation is idiomatic Laravel with
Filament's server-driven admin UI (Livewire 4 + TailwindCSS 4).

## 2. Tech stack (verified)

| Layer | Technology | Notes |
|---|---|---|
| Language | PHP 8.3+ | Modern PHP: enums, readonly, fibers |
| Framework | Laravel 13 | Eloquent ORM, queues, events, policies |
| Admin UI | FilamentPHP 5 | Form/Table/Infolist builders, panel-per-plugin |
| Reactivity | Livewire 4 | Server-driven interactivity, no separate SPA |
| Styling | TailwindCSS 4 | Design tokens via CSS variables |
| DB | MySQL 8.0+ / SQLite | No Postgres-first posture |
| Build | Node 18+, Vite | Asset pipeline only |

## 3. Plugin architecture

Two tiers, installed via `php artisan <plugin>:install`:

**Core (system) plugins — always on:**
| Plugin | Purpose |
|---|---|
| Analytics | Embedded BI widgets/dashboards |
| Chatter | Record-level threaded communication (Odoo-style "log note / send message" on every record) |
| Fields | **Runtime custom-field engine** — add fields to any model without migration authoring |
| Security | RBAC — roles, permissions, policy mapping |
| Support | Internal helpdesk |
| Table Views | Saved/filtered/user-customizable grid views |

**Installable plugins:**
| Domain | Plugins |
|---|---|
| Finance | Accounting, Accounts, Invoices, Payments |
| Operations | Inventories, Manufacturing, Products, Purchases, Sales |
| HR | Employees, Recruitments, Time-off, Timesheets |
| Relationships | Contacts, Partners |
| Projects/Content | Projects, Blogs, Website |

Each plugin is a self-contained Laravel package: own migrations, models, Filament resources,
policies, seeders; declares dependencies on other plugins (e.g. Invoices → Accounts → Contacts).

## 4. What AureusERP does exceptionally well (adopt)

1. **Chatter as a kernel service.** Every business record gets an activity feed, followers,
   mentions, and scheduled activities *for free*. This is bolted into the base model layer, not
   per-module. → Epic BOS must make "conversation on any record" a platform primitive.
2. **Fields plugin = no-code custom fields.** Runtime-defined fields with UI, validation, and
   storage handled centrally. → Epic BOS needs this as a first-class metadata service (see
   ERPNext DocType comparison — ERPNext goes further; AureusERP proves it works in a
   statically-typed ORM world too).
3. **Progressive disclosure via plugins.** A florist installs 4 plugins; a factory installs 12.
   Nothing else pollutes the UI. → Validates the Epic BOS "capability packs" model.
4. **Filament-style declarative UI.** Resources declare forms/tables/filters as PHP builders;
   the framework renders consistent, accessible UI. 10x faster CRUD authoring than hand-built
   SPA screens. → Epic BOS server-driven UI schema takes direct inspiration.
5. **MIT license.** The most permissive of the three references — no copyleft contamination
   concerns when borrowing *ideas* (we never copy code from GPL/LGPL repos anyway).

## 5. Weaknesses / gaps (avoid or improve)

1. **Accounting is young.** No statutory localization depth (no GST engine, no e-invoicing,
   no TDS). Trial balance/P&L exist; compliance does not.
2. **No manufacturing depth** — MRP exists as BOM + basic work orders; no capacity planning,
   subcontracting, or quality integration comparable to ERPNext/Odoo.
3. **Single-database, single-company bias.** Multi-company support is shallow; multi-tenancy
   is DIY.
4. **Livewire at scale.** Server-round-trip UI gets sluggish on heavy grids (thousands of rows,
   POS-speed interactions). Fine for admin backoffice; wrong for POS/field mobile.
5. **Reporting = widget dashboards.** No ad-hoc report builder, no pivot engine, no query
   studio.
6. **Ecosystem immaturity:** few third-party plugins, no marketplace, no vertical editions yet.

## 6. Data-model observations

- Conventional Laravel: `snake_case` tables, integer PKs, `created_at/updated_at`, soft deletes.
- Polymorphic relations used for chatter/followers/attachments (`chattable_type/chattable_id`).
- Partner model: single `partners` table with flags (customer/supplier/company/individual) —
  the Odoo `res.partner` pattern. Good instinct; we adopt a refined **Unified Party Model**
  (see `06-data-models/01-core-entities.md`).
- State machines are enum columns + guarded transitions in services, not a generic workflow
  engine — simpler, but industry overlays can't customize flows without code.

## 7. Verdict for Epic BOS

| Take | Leave |
|---|---|
| Chatter/activity kernel primitive | Livewire-only UI for high-frequency screens |
| Runtime custom Fields service | Shallow multi-company model |
| Plugin isolation + dependency graph | Accounting engine (too thin) |
| Declarative resource → UI schema idea | MySQL-first posture (we go Postgres-first) |
| MIT-style permissive licensing strategy | Enum-only state handling (we need a workflow engine) |

**One-line synthesis:** AureusERP proves a modern, modular, DX-friendly ERP core can be built
fast on a mainstream web framework — but it is 20% of an ERP; the deep 80% (accounting rigor,
compliance, manufacturing, reporting) is exactly what ERPNext and Odoo contribute.
