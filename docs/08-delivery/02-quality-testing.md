# Quality & Testing Strategy

> An ERP bug is someone's money or someone's tax notice. Quality budget is sized accordingly.

## 1. Test pyramid (per-layer ownership)

| Layer | What | Gate |
|---|---|---|
| Unit | Domain logic, engines, calculators | PR; >85% on `compliance/` and posting code |
| Golden files | Statutory artifacts: GSTR JSONs, e-invoice payloads, payslips, TDS challans, depreciation schedules — fixture-in, byte-exact-out | PR + statutory-update pipeline (05-*/test policies) |
| Invariant suite | The ten data invariants (data-arch §8) + cross-tenant leak attempts on every endpoint | PR, non-negotiable |
| Integration | Module flows against real Postgres/Redis (Testcontainers): submit→post→ledger→read-model chains | PR |
| Contract | OpenAPI/event-catalog diffs; SDK compatibility | PR (breaking = blocked) |
| E2E | Playwright on seeded demo tenants per industry pack; Flutter integration tests incl. offline scenarios (airplane-mode scripts, 3-day queue) | nightly + release |
| Performance | Voucher-entry latency, list p95 on 3G profile, POS local <100ms, 10k-SKU search, ledger reports on 10M-row fixtures, repost jobs | weekly + release |
| Chaos/ops | Kill workers mid-posting (transactional integrity), IRP/GSP outage drills, sync conflict storms | monthly |

## 2. The worked-example doctrine

Every module's spec has "ugly cases" (03-*/§5) — each becomes a named E2E fixture. The
pharma trace (data-models §8) pattern is replicated per module: one paranoid end-to-end
trace test asserting every row/artifact/event. New bug = new ugly case in the spec + test
before fix merges.

## 3. Statutory verification loop

- Rules-data updates require: CA-advisor sign-off recorded in PR, golden regeneration diff
  review, changelog in plain language (arch 03 §5 fast lane).
- **Parallel-run program:** design partners' real filings prepared in Epic BOS AND their
  incumbent (Tally/CA workpapers) for ≥2 cycles; diffs must be explained-or-fixed. This is
  the Phase-1 exit evidence (roadmap).
- Quarterly "notice simulation": can a tenant produce every register/working paper an
  officer asks for, from the UI, in minutes? Scored drill.

## 4. Release quality gates

Release train ships only when: zero P0/P1 open, golden suites green, upgrade rehearsal
(prod-clone + customization sets from N sampled tenants → zero breakage), perf budgets
met, security scan clean, rollback rehearsed. Statutory fast-lane releases: reduced scope,
same golden + upgrade gates, <72h target from rule notification to GA.

## 5. Beta & feedback machinery

Design-partner council (50 tenants Phase 1) with weekly office hours; in-product feedback
on every screen (screenshot + context auto-attached); feature flags enable cohort betas per
pack; support tickets auto-cluster (AI) into product backlog signals; public changelog in
Hindi + English.
