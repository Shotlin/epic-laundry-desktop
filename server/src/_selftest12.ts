// Foreground self-test #12: Projects & Services — Phase 8.
// Runs the kernel directly (no server) on isolated tenant 'TPRJ'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { billProject } from './modules/projects/billing.js';
import { runPosting } from './kernel/posting.js';
import { store } from './kernel/store.js';

const T = 'TPRJ';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const cust = createRow(T, 'test', 'party', { name: 'ClientX', gstin: '29XXX1234W1Z2', is_customer: true });
  const emp = createRow(T, 'test', 'employee', { name: 'Ravi', employee_name: 'Ravi K' });
  const proj = createRow(T, 'test', 'project', { name: 'Website Redo', customer: cust.id, billing_type: 'Time & Material', status: 'In Progress' });

  // Log 3 timesheets (100/h, 80/h, 120/h)
  const ts1 = createRow(T, 'test', 'timesheet', { employee: emp.id, project: proj.id, date: '2026-08-01', hours: 10, billing_rate: 100 });
  const ts2 = createRow(T, 'test', 'timesheet', { employee: emp.id, project: proj.id, date: '2026-08-02', hours: 8, billing_rate: 80 });
  const ts3 = createRow(T, 'test', 'timesheet', { employee: emp.id, project: proj.id, date: '2026-08-03', hours: 5, billing_rate: 120 });
  submitRow(T, 'test', 'timesheet', ts1.id);
  submitRow(T, 'test', 'timesheet', ts2.id);
  submitRow(T, 'test', 'timesheet', ts3.id);

  const r = billProject(T, 'test', proj.id);
  assert(r.ok, 'billProject succeeded');
  assert(r.hours === 23, `billed hours = 23 (got ${r.hours})`);            // 10+8+5
  assert(r.amount === 2240, `billed amount = 2240 (got ${r.amount})`);     // 1000+640+600
  assert(r.lines === 3, `invoice has 3 lines (got ${r.lines})`);

  // Invoice posts to GL (revenue + GST + debtors) on submit
  const inv = store.getRow(T, r.invoice_id!)!;
  const gl = await runPosting(T, inv, 1);
  assert(gl.length > 0, 'invoice posts GL entries');
  assert(inv.data.grand_total > 2240, `invoice grand_total includes GST (got ${inv.data.grand_total})`);

  // Re-billing finds no unbilled timesheets
  const r2 = billProject(T, 'test', proj.id);
  assert(!r2.ok, 're-bill reports no unbilled timesheets');

  console.log(`\nPhase-8 (Projects & Services) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
