# Module Spec: Projects & Timesheets

## 1. Job-to-be-done
Deliver client work (or internal jobs) on time and know per-project profit — billed vs cost —
without a separate PM tool.

## 2. Entities
`project` (customer-linked or internal; template-able), `task` (tree + dependencies),
`milestone`, `timesheet` (+ entries), `project_expense` (via expenses), `project_billing_rule`
(fixed/milestone/T&M/retainer), `resource_allocation` (planning).

## 3. Core flows
- Sales handoff: won opportunity/SO → project from template (task tree, milestones, budget).
- Execution: kanban/list/Gantt (deps, critical path-lite), assignments with capacity view,
  task chatter, customer-visible tasks (portal), files on project.
- Time: weekly grid + timer + mobile; approval; billable flag from billing rule.
- Money: milestone → invoice; T&M → unbilled timesheet/expense pull into invoice; project
  P&L = revenue − (time cost via employee cost rate + expenses + material issues from stock).
- Retention money and advance handling (construction/services reality).

## 4. Feature ladder
- **MVP:** projects, tasks, timesheets, simple billing (fixed/milestone), project dashboard.
- **v1:** T&M billing with rate cards, expenses/materials to project, Gantt + dependencies,
  templates, portal visibility, profitability report, WIP report (unbilled revenue).
- **v2:** resource capacity planning heatmap, inter-project dependencies, EVM-lite
  (planned vs earned vs actual), retainers with burn-down, subcontractor work orders.

## 5. Ugly cases
Scope change mid-fixed-price (change-order documents adjusting contract value); timesheet
backfill after invoice raised (lock billed entries); shared resource across 4 projects
(allocation conflicts); project spanning fiscal years with retention; GST on milestone
advances; internal projects absorbing costs (no revenue — report must not divide by zero).

## 6. India notes
Service invoices: SAC codes, GST on advances, TDS-by-customer (194J/194C) tracking against
receivables. Works-contract GST nuances for construction-adjacent projects (pack refines).

## 7. AI assists
Status summarization for client updates, delay-risk flags (velocity vs remaining), timesheet
nudges from calendar/commits (integrations).

## 8. KPIs
On-time %, utilization %, billable %, project margin, WIP/unbilled value, overdue tasks.
