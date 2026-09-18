// Foreground self-test #14: Quality & Compliance — Phase 10.
// Runs the kernel directly (no server) on isolated tenant 'TCMP'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { getComplianceSummary, verifyAuditTrail } from './modules/compliance/returns.js';

const T = 'TCMP';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  const cust = createRow(T, 'test', 'party', { name: 'GovBuyer', gstin: '29GGG1234W1Z2', is_customer: true });

  // A sale that books output GST (CGST/SGST liability)
  const item = createRow(T, 'test', 'item', { name: 'Gizmo', item_code: 'GZ', uom: 'NOS', rate: 1000, gst_rate: 18 });
  const sale = createRow(T, 'test', 'sales_invoice', { customer: cust.id, posting_date: '2026-07-01', place_of_supply: '29', items: [{ item: item.id, qty: 1, rate: 1000, gst_rate: 18 }] });
  submitRow(T, 'test', 'sales_invoice', sale.id); // output CGST/SGST = 90 each

  // A TCS entry
  const tcs = createRow(T, 'test', 'tcs_entry', { party: cust.id, posting_date: '2026-07-05', amount: 50 });
  submitRow(T, 'test', 'tcs_entry', tcs.id); // TCS Payable cr 50

  const s = getComplianceSummary(T);
  assert(Math.abs(s.output_gst - 180) < 0.01, `output GST = 180 (got ${s.output_gst})`);
  assert(Math.abs(s.net_gst_payable - 180) < 0.01, `net GST payable = 180 (got ${s.net_gst_payable})`);
  assert(Math.abs(s.tcs_payable - 50) < 0.01, `TCS payable = 50 (got ${s.tcs_payable})`);
  assert(s.audit_events > 0, `audit events recorded (got ${s.audit_events})`);

  const a = verifyAuditTrail(T);
  assert(a.ok && a.events === s.audit_events, 'audit trail verifies');

  console.log(`\nPhase-10 (Quality & Compliance) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
