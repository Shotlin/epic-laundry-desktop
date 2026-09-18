// Foreground self-test for the GST engine (run: npx tsx src/_selftest.ts).
// Exercises the kernel directly: create + submit intra/inter-state invoices, inspect GL,
// e-invoice, e-way, GSTR-1. Exits when done (no server left running).
import { createRow, submitRow, listRows } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import { buildEinvoicePayload } from './modules/gst/einvoice.js';
import { buildEwayPayload, buildGstr1, needsEway } from './modules/gst/gstr1.js';

const T = 'T1';
const company = { gstin: '29ABCDE1234F1Z5', name: 'Epic BOS Demo', addr: 'MG Road', state: '29' };
const party = { name: 'Sharma Traders', gstin: '29ABCDE1234F1Z5', pos: '29' };

function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) process.exitCode = 1; }

const line = { item: 'ITM-00001', qty: 5, rate: 350, gst_rate: 18 };

const cust = createRow(T, 'test', 'party', { name: 'Sharma Traders', gstin: '29ABCDE1234F1Z5', is_customer: true });

const a = createRow(T, 'test', 'sales_invoice', { customer: cust.id, posting_date: '2026-07-13', place_of_supply: '29', items: [line] });
const ra = submitRow(T, 'test', a.entity, a.id);
console.log(`\n[intra-state ${a.id}] grand_total=${ra.data.grand_total}  cgst=${ra.data.__gst.totalCgst} sgst=${ra.data.__gst.totalSgst} igst=${ra.data.__gst.totalIgst}`);
assert(ra.data.__gst.intraState === true, 'intra-state detected');
assert(ra.data.grand_total === 2065, 'intra grand_total = 2065');
assert(ra.data.__gst.totalCgst === 157.5 && ra.data.__gst.totalSgst === 157.5, 'CGST+SGST split (157.5 each)');

const b = createRow(T, 'test', 'sales_invoice', { customer: cust.id, posting_date: '2026-07-13', place_of_supply: '27', items: [line] });
const rb = submitRow(T, 'test', b.entity, b.id);
console.log(`[inter-state ${b.id}] grand_total=${rb.data.grand_total}  cgst=${rb.data.__gst.totalCgst} sgst=${rb.data.__gst.totalSgst} igst=${rb.data.__gst.totalIgst}`);
assert(rb.data.__gst.intraState === false, 'inter-state detected');
assert(rb.data.__gst.totalIgst === 315 && rb.data.__gst.totalCgst === 0, 'IGST only (315), no CGST/SGST');

const gl = store.glOf(T).filter((e) => e.voucher === a.id || e.voucher === b.id);
console.log('\nGL postings for the two invoices:');
for (const e of gl) console.log(`  ${e.account.padEnd(22)} dr=${e.debit} cr=${e.credit} voucher=${e.voucher}`);
const interIgst = gl.find((e) => e.voucher === b.id && e.account.startsWith('IGST'));
assert(!!interIgst && interIgst.credit === 315, 'inter-state posts IGST 315 to ledger');
const intraCgst = gl.find((e) => e.voucher === a.id && e.account.startsWith('CGST'));
assert(!!intraCgst && intraCgst.credit === 157.5, 'intra-state posts CGST 157.5 to ledger');

const ei = buildEinvoicePayload({ name: ra.data.name, posting_date: ra.data.posting_date, data: ra.data }, company, party, ra.data.__gst);
console.log('\nE-invoice ValDtls:', JSON.stringify(ei.ValDtls));
assert(ei.ValDtls.TotInvVal === 2065 && ei.ValDtls.CgstVal === 157.5, 'e-invoice payload totals correct');

console.log('E-way required for ₹2065?', needsEway(ra.data.__gst), '(expect false; threshold ₹50k)');
const ew = buildEwayPayload({ name: ra.data.name, posting_date: ra.data.posting_date, data: ra.data }, ra.data.__gst);
assert(ew.totalValue === 2065, 'e-way payload totalValue correct');

const invs = listRows(T, 'sales_invoice').filter((r) => r.status === 'Submitted').map((r) => ({ data: r.data, gst: r.data.__gst }));
const g1 = buildGstr1(invs, (data) => !!store.getRow(T, data.customer)?.data?.gstin);
console.log('GSTR-1 periodTotals:', JSON.stringify(g1.periodTotals), 'b2b lines:', g1.b2b.length, 'b2c lines:', g1.b2c.length);
assert(g1.b2b.length >= 2, 'GSTR-1 B2B aggregation works');

console.log('\nGST engine self-test complete.');
