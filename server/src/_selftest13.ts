// Foreground self-test #13: Fixed Assets & Depreciation — Phase 9.
// Runs the kernel directly (no server) on isolated tenant 'TFA'.
import { createRow, submitRow } from './kernel/entity-service.js';
import { runPosting } from './kernel/posting.js';
import { store } from './kernel/store.js';
import { computeDepreciation, runDepreciation } from './modules/assets/depreciation.js';

const T = 'TFA';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  // Laptop: cost 60000, salvage 6000, 5y, Straight Line -> monthly = (60000-6000)/5/12 = 900
  const lap = createRow(T, 'test', 'asset', {
    name: 'Laptop', asset_category: 'IT', purchase_date: '2026-01-01',
    purchase_value: 60000, salvage_value: 6000, useful_life: 5, depreciation_method: 'Straight Line', status: 'In Use',
  });
  assert(computeDepreciation(lap, '2026-07') === 900, `SL monthly = 900 (got ${computeDepreciation(lap, '2026-07')})`);

  // Vehicle: cost 300000, salvage 30000, 5y, WDV -> first month = 300000*(1-(0.1)^0.2)/12
  const veh = createRow(T, 'test', 'asset', {
    name: 'Vehicle', asset_category: 'Transport', purchase_date: '2026-01-01',
    purchase_value: 300000, salvage_value: 30000, useful_life: 5, depreciation_method: 'Written Down Value', status: 'In Use',
  });
  const wdv1 = computeDepreciation(veh, '2026-07');
  assert(wdv1 > 5000 && wdv1 < 15000, `WDV first month positive & reasonable (got ${wdv1})`);

  // Run depreciation for the period
  const res = runDepreciation(T, 'test', '2026-07');
  assert(res.entries.length === 2, `2 assets depreciated (got ${res.entries.length})`);
  assert(res.total === Math.round((900 + wdv1) * 100) / 100, `total depreciation = 900 + WDV`);

  // Asset book values updated and GL posted
  const lapR = store.getRow(T, lap.id)!;
  assert(lapR.data.accumulated_depreciation === 900, `laptop accumulated dep = 900 (got ${lapR.data.accumulated_depreciation})`);
  assert(lapR.data.book_value === 59100, `laptop book value = 59100 (got ${lapR.data.book_value})`);

  const dep = createRow(T, 'test', 'depreciation_entry', { asset: lap.id, period: '2026-07', amount: 900 });
  const gl = await runPosting(T, dep, 1);
  const hasExp = gl.some((g) => g.account === 'Depreciation Expense' && g.debit === 900);
  const hasAcc = gl.some((g) => g.account === 'Accumulated Depreciation (Asset)' && g.credit === 900);
  assert(hasExp && hasAcc, 'depreciation posts Expense dr + Accumulated Depreciation cr');

  console.log(`\nPhase-9 (Fixed Assets) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
