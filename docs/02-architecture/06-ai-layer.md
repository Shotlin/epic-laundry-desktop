# AI Layer — "AI-Native, Human-Approved"

> None of the three references is AI-native. This is Epic BOS's largest greenfield advantage —
> and its largest trust risk if done carelessly. Governing rule (blueprint §2.7): **AI drafts,
> humans approve; no silent AI writes to ledgers.**

---

## 1. Where AI creates value (ranked by Indian-SMB impact)

| # | Capability | What it does | Module |
|---|---|---|---|
| A1 | **Document → Entry** | Photo/PDF of purchase bill, expense receipt, bank statement → drafted, GST-split, HSN-coded entries with confidence scores | accounting, expenses, purchase |
| A2 | **Reconciliation copilot** | Bank/UPI feed lines matched to invoices/payments; GSTR-2B ↔ purchase register matching with reason codes | banking, india-compliance |
| A3 | **Compliance sentinel** | Watches deadlines, mismatches, threshold crossings ("turnover nearing ₹5 Cr — e-invoicing will apply"), drafts IMS actions | india-compliance |
| A4 | **NL reporting** | "Show top 10 customers by margin this quarter in Marathi" → report spec → rendered table/chart; saved as a real report | analytics |
| A5 | **Cash-flow forecast** | Receivables/payables aging + seasonality → 13-week cash forecast, collection prioritization | accounting, crm |
| A6 | **Sales copilot** | Lead scoring, next-best-action, WhatsApp/email reply drafts, quote generation from conversation | crm, sales |
| A7 | **Demand forecast & reorder** | Per-SKU/branch seasonality-aware reorder proposals | inventory |
| A8 | **Voice + vernacular entry** | "Sharma ji ko 5 bori cement ka bill banao" → drafted invoice (12 languages, code-switching tolerated) | all |
| A9 | **Anomaly guard** | Duplicate bills, price outliers, discount abuse, ghost employees, round-tripping patterns | accounting, hr, pos |
| A10 | **Support deflection** | In-product help ("why is my ITC blocked?") answered from tenant data + knowledge base | platform |

## 2. Architecture

- **AI Gateway** (separate deployable): provider-agnostic adapters (Anthropic primary;
  pluggable OpenAI/local Ollama for self-host), request classification → model routing
  (small models for classification/extraction, frontier for reasoning), response validation
  against JSON schemas, cost metering per tenant.
- **Grounding:** every AI feature is tool-based — the model calls typed, permission-checked
  tools (`search_invoices`, `get_ledger`, `draft_document`) executed with the *user's* RBAC
  context. The model never gets raw DB access; it cannot see rows the user can't.
- **RAG:** pgvector embeddings over tenant documents, item catalogs, help content; strict
  tenant partitioning; embedding refresh via event bus.
- **Determinism guard:** statutory computations (GST, TDS, payroll) are **never** LLM-computed
  — rule engines compute; AI only explains, drafts, and matches.

## 3. Trust & governance

- Confidence thresholds: below threshold → "needs review" queue, never auto-apply.
- Full AI audit log: prompt, tools called, output, who approved, model/version.
- Per-tenant AI policy: on/off per capability, external-provider consent (DPDP), data
  redaction level, monthly budget caps.
- Feedback loops: every accept/reject/edit trains tenant-level preference profiles
  (few-shot memory, not fine-tuning on customer data by default).

## 4. Phasing

- **v1:** A1, A2, A4, A8 (Hindi+English), A10 — the "wow + daily utility" set.
- **v1.5:** A3, A5, A6.
- **v2:** A7, A9, full 12-language voice, auto-pilot rules (user-armed thresholds for
  auto-submit of high-confidence expense entries — still logged, still reversible).
