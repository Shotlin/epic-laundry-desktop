# Security Architecture

> An ERP holds a company's money, taxes, salaries, and secrets. Security posture is a sales
> document in India's SMB market ("is my data safe from my competitor? my own staff?").

---

## 1. Threat model (top actors)

1. **Insider misuse** — staff editing prices, deleting invoices, exporting customer lists.
   → field-level permissions, immutable postings, export-permission + export-audit, anomaly
   alerts ("cashier applied 47 discounts today").
2. **Tenant cross-leak** — the existential SaaS risk. → RLS + app-layer double filter +
   automated cross-tenant leak tests in CI (attempt every endpoint with foreign IDs).
3. **Credential theft** — OTP fatigue, phished owners. → 2FA default-on for admin/finance
   roles, device binding, impossible-travel alerts, session revocation UI.
4. **API abuse** — leaked keys. → scoped keys, per-key rate limits, secret scanning
   partnerships, key age nudges.
5. **Ransomware on self-host** — → offsite encrypted backups by default, restore drills.
6. **Supply chain** — → locked dependencies, SBOM, Renovate + review, signed releases.

## 2. Controls (summary)

- **Encryption:** TLS 1.3 everywhere; AES-256 at rest; field-level envelope encryption for
  high-sensitivity fields (salary, bank a/c, PAN, Aadhaar-last-4 only — we never store full
  Aadhaar), per-tenant data keys (KMS).
- **Secrets:** Vault/KMS; no secrets in env files for cloud; self-host gets sane defaults +
  key rotation tooling.
- **AppSec:** OWASP ASVS L2 target; centralized input validation via Schema Registry; CSP,
  strict CORS; SSRF-safe webhook egress (proxy + allowlist); file-upload scanning; SQL only
  via parameterized layers.
- **Auditability:** kernel audit log (platform-core §11) covers auth events, permission
  changes, exports, AI actions; tamper-evident hash chain.
- **Sandbox:** T3 scripts in GraalVM isolates — CPU/memory/time budgets, no filesystem, no
  raw network (capability-token egress only).
- **Backups:** encrypted, tested restores, tenant-scoped restore capability (fat-finger
  recovery without full-instance rollback).

## 3. Compliance certifications (roadmap)

| When | What |
|---|---|
| v1 | DPDP-ready posture, VAPT by CERT-In-empanelled auditor, ISO 27001 program start |
| v1.5 | ISO 27001 certification, SOC 2 Type I |
| v2 | SOC 2 Type II; GST Suvidha Provider (GSP) partnership hardening or own GSP evaluation |

## 4. Privacy engineering

- PII tagging in Schema Registry (`pii: contact|financial|sensitive`) drives masking, export
  redaction, retention, and DPDP consent mapping automatically — privacy enforced by the
  metadata engine, not by developer memory.
- Role-based field masking (e.g. telecaller sees `98•••••210`).
- Data-minimizing AI: PII redaction before external model calls; tenant opt-out of external
  AI (falls back to local models with reduced features).

## 5. Fraud-resistance features (product-level security)

Indian SMB owners fear internal fraud more than hackers. Ship as features:
- Immutable submitted documents + mandatory credit-note trail (no silent invoice edits).
- Cash session reconciliation in POS with denominations + variance approval.
- Price/discount guardrails with approval breach flow.
- "Owner digest": daily WhatsApp summary — sales, cash, discounts, cancellations, edits.
- Segregation-of-duties presets (maker–checker for payments, vendor changes, payroll runs).
