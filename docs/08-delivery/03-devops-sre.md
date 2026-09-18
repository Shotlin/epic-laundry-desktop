# DevOps & SRE

## 1. Environments & pipeline

`dev → ci → staging (prod-clone data shape) → canary (5% tenants) → prod` per region.
IaC (Terraform + Helm); ephemeral preview envs per PR (compose-in-k8s) with seeded demo
tenant; DB migrations expand-contract only (arch 03 §4.1), rehearsed on staging clones with
production-scale fixtures.

## 2. Observability

OpenTelemetry end-to-end (trace a voucher submit through posting→events→projections);
metrics: RED per endpoint + business SLIs (posting latency, sync lag, IRP success rate,
webhook delivery, AI queue depth); logs structured + tenant-tagged (PII-scrubbed); per-
tenant health scores (error rate, sync staleness) feeding proactive support. Status page
public (trust, arch 03 §6).

## 3. SLOs (cloud)

| SLI | SLO |
|---|---|
| API availability | 99.9% monthly |
| Voucher submit p95 | < 800ms |
| POS sync lag p95 | < 60s after connectivity |
| E-invoice round trip p95 | < 6s (GSP-dependent; degraded-mode queue beyond) |
| Statutory-release lead time | < 72h from notification |
| RPO / RTO | 5 min / 1 hr (arch 03 §6) |

Error budgets gate feature-release trains (SRE handshake).

## 4. Incident & on-call

Two rotations: platform (infra) + compliance (filing-season aware — staffing doubles around
the 11th/20th monthly and quarterly peaks; the GST calendar IS our traffic calendar).
Runbooks per failure class: GSP outage (queue + portal-JSON fallback comms), bank-feed
stalls, repost storms, sync-conflict spikes. Blameless postmortems, public RCA for
customer-visible incidents.

## 5. Cost & capacity

Per-tenant unit economics dashboard (storage, compute, AI tokens, WA/SMS spend) —
free-tier abuse guards (quotas as data); capacity planning around month-end multipliers
(5–8× filing-week load modeled from GSTN patterns); AI spend capped per tenant tier with
graceful degradation (queue, don't fail).

## 6. Self-host support posture

`epic doctor` diagnostic CLI (env checks, backup health, version drift); telemetry opt-in
only (DPDP-clean), crash reports anonymized; community support tiers + paid support SKU;
self-host → cloud migration tooling (and the reverse — the no-lock-in promise is
bidirectional, vision 03 anti-goals).
