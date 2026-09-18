# Architecture Decision Records (ADR)

> Irreversible / high-impact decisions. The blueprint is canonical; ADRs capture *why* a
> locked choice was made or revised. New high-impact decisions get a new ADR.

---

## ADR-002 — Executable Phase-0 backend in TypeScript (Node), Kotlin/Spring retained as port target

**Status:** accepted (2026-07-13) · **Supersedes** blueprint §1's "Kotlin-only" posture for the
*executable* slice (the planning target remains Kotlin/Spring Boot).

**Context:** The blueprint locked Kotlin/JVM for type-safety, auditability, and the "shotlin"
founding intent. But this execution environment has **Node 24 + npm + Docker and no JDK/Gradle**,
and the founder's WhatsApp tool (`shotlinXchat`/WhatsAPI) is itself Node/Fastify. Building a
runnable, verifiable Phase-0 kernel *now* beats a language-pure plan we cannot compile here.

**Decision:** Build the Phase-0 kernel (Schema Registry, posting engine, event outbox, audit,
AuthZ/RLS, WhatsApp connector) in **Node.js + TypeScript (Fastify)** so it runs and integrates
with WhatsAPI immediately. The metadata-driven design is **language-agnostic**; porting to
Kotlin/Spring Boot later is mechanical (the contracts in `02-platform-core.md` are unchanged).

**Consequences:**
- + Verifiable MVP this session; native fit with the Node WA tool; one language across backend
  + Electron desktop.
- − Diverges from the documented production stack until the port happens. We treat TS Phase-0 as
  the *prototype/validation* path and Kotlin/Spring as the *hardened production* path.
- The founder may veto and ask for a JDK install + Kotlin port at any time; the kernel contracts
  make that a rewrite of implementation, not design.

---

## ADR-003 — Desktop surface on Electron (Windows/macOS/Linux)

**Status:** accepted (2026-07-13).

**Decision:** The owner/admin/back-office client is delivered as an **Electron** app wrapping the
React SPA. Rationale: one codebase for all three OSes, reuses the SPA + Node tooling, enables
auto-update / tray / OS-keychain / file associations for e-invoice JSON & IRN.

**Tauri** is recorded as the lean follow-up (≈10x smaller binaries, lower RAM) once the SPA
stabilizes; it loses the bundled Node runtime our integration tooling expects, so it is deferred.

---

## ADR-004 — WhatsApp via `shotlinXchat` (WhatsAPI / Baileys)

**Status:** accepted (2026-07-13).

**Decision:** The founder's own `shotlinXchat` (Fastify + Baileys WhatsApp-Web backend) is the
**first** `WhatsAppConnector` implementation (`GenericFreeToolConnector`). It is freeform-only
(no Meta templates/catalog/payment-buttons); we attach our own UPI/Razorpay links in message
bodies. Meta Cloud API / a BSP is the documented scale/enterprise escape hatch behind the same
interface. See [`07-whatsapp-integration.md`](07-whatsapp-integration.md) §7 for the filled
connector descriptor.

**Consequence:** WhatsApp-Web carries ToS/ban risk; enforce consent, rate limits, and opt-out,
and keep volumes sane. The interface makes switching to the official API a config change.
