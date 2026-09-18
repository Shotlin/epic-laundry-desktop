# Risk Register

> Scored Impact × Likelihood (H/M/L). Owners assigned at Phase-0 kickoff; reviewed monthly.

| # | Risk | I×L | Mitigation (doc anchors) |
|---|---|---|---|
| R1 | **Scope drowning** — "everything for every industry" stalls shipping | H×H | Phase gates with kill criteria (roadmap); wave discipline; kernel-first (Phase 0 exit test); catalog tiers keep "later" honest |
| R2 | **Statutory error ships** → tenant penalties, brand death | H×M | Golden files + CA sign-off + parallel-run program (QA §3); fast-lane releases; insurance (professional liability) explored |
| R3 | Schema Registry over-engineering (inner-platform effect) | H×M | Phase-0 exit test is concrete; hand-built escape hatches allowed (workbenches); registry serves modules, not vice versa |
| R4 | GSP/IRP/GSTN API instability | M×H | Multi-GSP abstraction, queue+retry+portal-JSON fallback (05/01 §3), degraded-mode UX, status comms runbooks |
| R5 | Tally inertia stronger than product quality | H×M | CA channel as wedge (GTM §2.1), migration offense (§5), free tier land-and-expand; if Phase-1 partners won't switch, kill criteria trigger |
| R6 | Big-tech/incumbent response (Tally cloud matures, Zoho bundles harder) | M×M | Moats that need architecture (offline+packs+open-core+compliance-in-kernel) not features; speed |
| R7 | Kotlin talent for domain logic slower than expected | M×M | Modular monolith keeps onboarding local; codegen from metadata reduces boilerplate; hiring pipeline via open source |
| R8 | AI accuracy below trust threshold in messy vernacular docs | M×M | Human-first flows primary (principle 8), confidence gating, feature demotion path (roadmap kill clause) |
| R9 | Offline sync corruption events | H×L | Create-only offline design (tech-stack §7), invariant suite, conflict UX (mobile §3), chaos drills |
| R10 | Free-tier cost blowout / abuse | M×M | Quota-as-data, unit-economics dashboard (devops §5), WA/SMS pass-through pricing |
| R11 | Open-core fork or license conflict | L×M | AGPL + trademark policy (GTM §4); community governance transparency |
| R12 | DPDP/regulatory shift on data or AI | M×M | PII-by-metadata design adapts via data (arch 05 §4); local-model fallback (arch 06) |
| R13 | Founder/tiny-team bus factor during Phase 0–1 | H×M | Docs-first discipline (this tree IS the backup brain), pairing on kernel, advisor bench |
| R14 | Feature-parity trap vs references (rebuilding Odoo instead of out-positioning) | M×M | Differentiators list (research 04 §5) reviewed at each phase gate: are we shipping *ours*? |

## Standing review questions (monthly)
1. Which risk moved? 2. What did support tickets say the docs didn't predict? 3. Is any
mitigation now a product requirement that belongs in a spec? 4. What would make us stop —
and are we honestly measuring it?
