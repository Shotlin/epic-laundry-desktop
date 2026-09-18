# Product Principles (The Twelve)

> Tie-breakers for every future design debate. Each principle names the failure it prevents.
> Blueprint §2 is the condensed form; this file is the operating version with tests.

---

1. **India-first, not India-also.**
   *Test:* any feature spec that says "and later we'll localize for India" is rejected;
   statutory correctness ships in core, free tier included.
   *Prevents:* the Odoo trap (compliance as partner afterthought).

2. **One system, one truth.**
   Masters (party, item, employee, account) exist once; every module reads the same row.
   *Test:* if a feature needs a second copy of a master, the feature is wrong.
   *Prevents:* the Zoho seam problem, ERPNext's duplicate CRMs.

3. **Owner-grade first, expert-grade one tap deeper.**
   Default screens answer owner questions (aaj ka business? kaun paisa dega?); ledgers,
   vouchers, registers are one tap away, never removed.
   *Prevents:* both failure modes — toy app ceiling and accountant-only UI.

4. **Progressive complexity.**
   Modules/fields/reports appear when activated; a new tenant sees ≤ 5 nav items.
   *Test:* every new module must define its "invisible until needed" behavior.

5. **Immutable money.**
   Submitted financial documents never mutate; corrections are visible trails
   (amend/credit-note/reversal).
   *Prevents:* fraud, audit failures, MCA/GST exposure; enables offline sync sanity.

6. **Metadata over code; customization is data.**
   *Test:* a vertical requirement that demands a code fork means the platform lacks a
   metadata capability — build the capability, not the fork.

7. **Works where India works.**
   2G-tolerant, offline POS/field, ₹8k Android, power-cut resilient, Hinglish tolerated.
   *Test:* demo every release on a low-end device on throttled 3G.

8. **AI drafts, humans approve.**
   No unreviewed AI write reaches a ledger; statutory math is rule-engine only.
   *Prevents:* the one hallucinated invoice that destroys brand trust forever.

9. **Minutes to value.**
   GSTIN → configured company → first compliant invoice in under 15 minutes; every module has
   a "first win in one session" path with sample-data sandbox.

10. **Trust is a feature list.**
    Export-everything, self-host option, audit log, India residency, status page, no
    dark-pattern lock-in.
    *Test:* "can the customer leave easily?" must always be yes — it's why they stay.

11. **The accountant is a user, not an obstacle.**
    CA console, auditor role, Tally-bridge for handoff, working-paper exports.
    *Prevents:* channel sabotage by the profession that advises our buyers.

12. **Depth beats demos.**
    A feature ships when it survives the messy case (partial payments, RCM, returns of
    batched expiring stock, mid-month salary revision) — not when the happy path demos well.
    *Test:* every module spec in 03-modules includes its "ugly cases" section.
