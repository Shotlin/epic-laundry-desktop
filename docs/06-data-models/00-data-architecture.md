# Data Architecture — Conventions & Invariants

## 1. Identity & keys
- PK: `id BIGINT IDENTITY` internal; `public_id` (ULID) for APIs/URLs (sortable, non-
  enumerable); human key `name` (series-generated, e.g. `INV-2627-00042`) for business refs.
- Every table: `tenant_id` (RLS), `company_id` where org-scoped, `created_at/by`,
  `updated_at/by`, `version` (optimistic locking). Soft delete only for masters
  (`archived_at`); documents are never deleted (lifecycle instead).

## 2. Money & quantity discipline
- `NUMERIC(18,6)` storage; currency amounts rounded per currency minor unit at document
  level with explicit `rounding_adjustment` row; tax computations at line level with
  document-level reconciliation row (GST paise rules).
- Quantities `NUMERIC(18,6)` + `uom`; conversions via versioned factors — stored both as
  entered (`qty`, `uom`) and canonical (`stock_qty` in stock UOM). Exchange rates: rate
  stored on document at posting (never recomputed from history).

## 3. Custom fields & metadata layering
- `custom JSONB` on every entity + GIN index; validation from Schema Registry at write
  time; reporting engine exposes JSONB paths as virtual columns. Pack overlay fields are
  namespaced (`pharma__schedule_class`) to prevent collisions (arch 04 §3).

## 4. Temporal correctness
- Effective-dated reference data (tax rates, statutory rules, prices, salary structures):
  `(valid_from, valid_to)` ranges + exclusion constraints; queries always as-of transaction
  date — the compliance recompute guarantee (05-*/golden files).
- Ledgers: `posting_date` (business) vs `created_at` (system) strictly separated; period
  locks validate `posting_date`.

## 5. Concurrency & integrity
- Documents: optimistic locking (`version`); ledger posting inside the submit transaction;
  gapless series via `SELECT … FOR UPDATE` on series row (only where legally needed).
- Stock: per (item, warehouse) serialized application at posting queue level to keep
  valuation deterministic; backdated inserts enqueue reposts (platform-core §2).
- FK discipline: masters `RESTRICT` (no deleting used masters), children `CASCADE` within
  document aggregates only.

## 6. Partitioning & scale
- `gl_entry`, `stock_ledger_entry`, `audit_log`, `event_outbox`: range-partitioned by month;
  detach-and-archive policy after statutory horizon to cold storage (queryable via
  analytics mirror).
- Read models: reporting projections (aging snapshots, stock balances by day) maintained by
  event consumers — heavy reports never scan raw ledgers at request time.

## 7. Naming conventions
`snake_case` tables/columns; singular entity names in Schema Registry, plural tables;
child tables `parent_child` (`sales_invoice_item`); enum columns end `_status`/`_type`;
boolean `is_*`/`has_*`; ledger tables end `_ledger_entry`/`_entry`.

## 8. The ten data invariants (CI-enforced)
1. No write outside tenant RLS context.
2. No mutation of submitted document rows (except whitelisted post-submit columns).
3. Every GL posting balances (Σdebit = Σcredit) per (document, company, currency).
4. Stock ledger never leaves (item, warehouse, batch) negative unless override-flagged.
5. Ledger rows immutable — corrections are new reversal rows.
6. Every document row traces to a series allocation record.
7. Effective-dated tables have no overlapping ranges per key.
8. `posting_date` within an open period at write time.
9. Every event in outbox before commit acknowledges to caller.
10. JSONB custom fields validate against registry schema version stamped on the row.
