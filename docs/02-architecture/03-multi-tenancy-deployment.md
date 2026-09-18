# Multi-Tenancy, Org Model & Deployment

---

## 1. Organizational model (inside one tenant)

```
Tenant (Organization)
└── Company (legal entity, PAN)            ← consolidation across companies (paid tier)
    ├── GST Registration (GSTIN, per state) ← tax identity; e-invoice/e-way per GSTIN
    ├── Branch / Location                   ← operational unit; series, permissions
    │   └── Warehouse(s), POS terminals
    ├── Fiscal Year + Period locks
    └── Cost Centers / Profit Centers (tree)
```

Rules that Indian reality forces (and references half-support):
- One company ↔ many GSTINs (state-wise registrations); stock transfer between two GSTINs of
  the same company is a **taxable supply needing e-way/e-invoice** — the org model must make
  this a first-class flow, not a workaround.
- Branch-level everything: invoice series, bank accounts, permissions, dashboards.
- Consolidated + standalone reporting: company-level statutory, tenant-level management view.

## 2. Tenancy architecture (cloud)

**Decision: shared database, shared schema, PostgreSQL RLS.**

- Every table carries `tenant_id`; RLS policies bind to `current_setting('app.tenant')`;
  application sets it per request/job. Belt-and-braces: repository layer also filters.
- **Why not site-per-tenant (Frappe):** ops explosion (backups, migrations, monitoring × N),
  slow tenant provisioning, wasted resources on small tenants.
- **Why not schema-per-tenant default:** migration fan-out and connection-pool pressure at
  10k+ tenants; loses cross-tenant ops simplicity.
- **Escape hatch (paid/enterprise):** dedicated schema or dedicated DB per big tenant —
  same code, different `DataSource` routing. Noisy-neighbor guardrails everywhere:
  per-tenant rate limits, statement timeouts, queue fairness, row quotas.

Tenant provisioning: < 60 seconds, fully automated (signup → GSTIN lookup → seeded company).
Tenant export: full-fidelity dump (data + customization sets + files) — **no lock-in is a
feature**; import into self-host must work (trust weapon vs Zoho/Tally cloud).

## 3. Data residency & DPDP posture

- Default region: India (Mumbai primary, Hyderabad DR). Cross-region replication opt-in only.
- DPDP Act compliance: consent registry for personal data, purpose tags on PII fields
  (Schema Registry metadata), right-to-erasure workflows that respect statutory retention
  (ledger names can't be erased; marketing PII can), breach-notification runbooks.
  Details in `05-india-compliance/05-corporate-regulatory.md`.

## 4. Deployment profiles

### 4.1 `cloud` (SaaS)
K8s (managed), pools: `web` (API+SSR), `worker` (jobs), `sync` (mobile gateway), `ai-gw`.
Postgres HA (Patroni/managed), PgBouncer, Redis, OpenSearch, MinIO/S3, Prometheus+Grafana+
Loki+Tempo, per-tenant usage metering (billing + abuse detection).
Zero-downtime deploys: expand-migrate-contract DB pattern; metadata upgrades gated by the
conflict report (see platform-core §1).

### 4.2 `solo` (self-host)
One `docker compose up`: app, worker, Postgres, Redis, MinIO; optional OpenSearch (search
degrades to Postgres FTS without it). Target: 2 vCPU / 4 GB works for 25 users. Built-in
backup-to-S3/Drive scheduler + one-click restore. Auto-update channel with staged metadata
migration and rollback.

### 4.3 `edge-pos`
POS terminals (Android/Windows via Flutter) run fully offline against local SQLite;
store-and-forward sync (tech stack §7). A store hub (optional Raspberry-Pi-class box) can
serve LAN terminals when internet dies for days — the mandi/tier-3 reality.

## 5. Environments & release trains

- Tenant-facing: `production`, `sandbox` (free per tenant — accountants test GST filing
  safely; the sandbox habit is an adoption weapon).
- Release trains: monthly feature, weekly fix, **out-of-band statutory** (GST rule changes
  ship in days; the compliance team owns a fast lane with its own test gate).
- Customization Sets promote sandbox → production with diff review.

## 6. Backup/DR

RPO 5 min (WAL shipping), RTO 1 hr cloud. Statutory artifact archive (signed e-invoice JSONs,
filed returns) in WORM storage, 8-year retention. Quarterly restore drills, published status
page — SMBs buy trust, not SLAs.
