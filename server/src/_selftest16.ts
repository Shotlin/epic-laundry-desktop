// Foreground self-test #16: Platform & Ecosystem — Phase 12.
// Runs the kernel directly (no server) on isolated tenant 'TECO'.
import { createRow } from './kernel/entity-service.js';
import { roleCan } from './modules/rbac/roles.js';
import { paymentLink } from './modules/integrations/payments.js';
import { runBot } from './modules/integrations/rpa.js';
import { store } from './kernel/store.js';

const T = 'TECO';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  // RBAC: per-role permission matrix
  const def = {
    permissions: [
      { role: 'cashier', read: true, write: true, submit: true, cancel: false },
      { role: 'viewer', read: true, write: false, submit: false, cancel: false },
    ],
  };
  assert(roleCan('admin', 'cancel', def), 'admin can cancel');
  assert(roleCan('cashier', 'submit', def), 'cashier can submit');
  assert(!roleCan('cashier', 'cancel', def), 'cashier cannot cancel');
  assert(!roleCan('viewer', 'write', def), 'viewer cannot write');
  assert(roleCan('viewer', 'read', def), 'viewer can read');

  // RBAC users + marketplace app registry
  const u = createRow(T, 'test', 'user', { username: 'raj', role: 'cashier', active: true });
  assert(u.id.startsWith('USR-'), `user series (${u.id})`);
  const app = createRow(T, 'test', 'app_def', { name: 'Restaurant POS', module: 'restaurant', price: 0 });
  assert(app.id.startsWith('APP-'), `app series (${app.id})`);

  // Payments: UPI intent (offline-friendly) and Razorpay-ready payload
  const upi = paymentLink({ amount: 500, description: 'INV-1' });
  assert(upi.method === 'upi' && upi.intent!.includes('upi://pay') && upi.intent!.includes('am=500'), 'UPI intent generated');
  const rz = paymentLink({ amount: 500, razorpay: { key: 'rz_live_xxx' } });
  assert(rz.method === 'razorpay' && rz.payload!.key === 'rz_live_xxx' && rz.payload!.amount === 50000, 'Razorpay payload generated (paise)');

  // RPA: bot run emits an outbox event for an external worker
  const bot = runBot(T, 'test', 'send-reminder', { who: 'raj' });
  assert(bot.ok && typeof bot.event === 'string', 'rpa bot queued an event');
  const pending = store.outboxUnpublished(T).some((e) => e.type === 'rpa.send-reminder');
  assert(pending, 'outbox has rpa.send-reminder event');

  console.log(`\nPhase-12 (Platform & Ecosystem) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
