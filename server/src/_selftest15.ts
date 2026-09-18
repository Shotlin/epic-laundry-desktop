// Foreground self-test #15: Multi-entity / Multi-currency / Branches — Phase 11.
// Runs the kernel directly (no server) on isolated tenant 'TMULTI'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { runPosting } from './kernel/posting.js';
import { getRate } from './modules/multi-entity/fx.js';

const T = 'TMULTI';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  // Multi-entity registry + currency + branch masters
  const co = createRow(T, 'test', 'company', { name: 'Epic Holdings', gstin: '29HLD1234W1Z2', default_currency: 'INR' });
  const br = createRow(T, 'test', 'branch', { name: 'MG Road', code: 'MGR', company: co.id });
  const usd = createRow(T, 'test', 'currency', { code: 'USD', symbol: '$', exchange_rate: 83 });
  assert(usd.data.name.startsWith('CCY-'), `currency series (${usd.data.name})`);
  assert(getRate(T, 'USD') === 83, `USD rate = 83 (got ${getRate(T, 'USD')})`);
  assert(getRate(T, 'INR') === 1, 'INR rate = 1');

  // A USD sale: 100 USD + 18% GST = 118 USD -> 9794 INR at 83
  const cust = createRow(T, 'test', 'party', { name: 'US Importer', is_customer: true });
  const item = createRow(T, 'test', 'item', { name: 'Widget', item_code: 'W', uom: 'NOS', rate: 100, gst_rate: 18 });
  const sale = createRow(T, 'test', 'sales_invoice', {
    customer: cust.id, posting_date: '2026-07-01', place_of_supply: '29',
    currency: 'USD', exchange_rate: 83, branch: br.id,
    items: [{ item: item.id, qty: 1, rate: 100, gst_rate: 18 }],
  });
  const gl = await runPosting(T, sale, 1);
  assert(sale.data.grand_total === 118, `grand_total in USD = 118 (got ${sale.data.grand_total})`);
  assert(sale.data.base_grand_total === 9794, `base (INR) grand_total = 9794 (got ${sale.data.base_grand_total})`);
  const debtors = gl.find((g) => g.account === 'Debtors (Assets)');
  assert(debtors?.debit === 9794, `Debtors booked in INR = 9794 (got ${debtors?.debit})`);
  const cgst = gl.find((g) => g.account === 'CGST (Liability)');
  assert(cgst?.credit === 747, `CGST in INR = 747 (got ${cgst?.credit})`);

  // Branch is carried on the document
  assert(sale.data.branch === br.id, 'branch linked on invoice');

  console.log(`\nPhase-11 (Multi-entity / Multi-currency / Branches) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
