// Epic BOS self-test 24 — Phase 1 (P19) CRM/Engagement depth:
// template rendering, the offline channel gateway, templated send, campaign execution with
// per-recipient touch tracking, campaign stats, and the notification center.
// Runs the kernel directly (no server, no network) on isolated tenant 'TENG'.
import { createRow } from './kernel/entity-service.js';
import { store } from './kernel/store.js';
import {
  renderTemplate, mergeVarsFor, sendMessage, sendTemplated, runCampaign, campaignStats,
  notify, listNotifications, markNotificationRead, markAllRead, syncAlertsToNotifications,
} from './modules/crm/engagement.js';

const T = 'TENG';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  // --- Template rendering (merge fields) ---
  const rendered = renderTemplate('Hi {{name}}, your order at {{org}} is ₹{{amount}}.', { name: 'Ravi', org: 'Sharma Traders', amount: 5000 });
  assert(rendered === 'Hi Ravi, your order at Sharma Traders is ₹5000.', `template merge fields (got "${rendered}")`);
  assert(renderTemplate('Hi {{missing}}!', {}) === 'Hi !', 'missing merge field renders empty');

  // --- Audience setup ---
  const c1 = createRow(T, 'test', 'party', { name: 'Anita Retail', phone: '919812300001', email: 'anita@example.com', is_customer: true, consent: true });
  const c2 = createRow(T, 'test', 'party', { name: 'Bhola Store', phone: '919812300002', is_customer: true, consent: false });
  const c3 = createRow(T, 'test', 'party', { name: 'NoPhone Traders', is_customer: true, consent: true }); // no phone
  const l1 = createRow(T, 'test', 'lead', { name: 'Chetan Lead', phone: '919812300003', source: 'WhatsApp', stage: 'New' });

  // --- mergeVarsFor pulls the party record ---
  const vars = mergeVarsFor(T, c1.id, { amount: 999 });
  assert(vars.name === 'Anita Retail' && vars.phone === '919812300001' && vars.amount === 999, 'mergeVarsFor pulls record + extras');

  // --- Gateway offline behaviour: WhatsApp fails gracefully (no service), Email/SMS log ok offline ---
  const wa = await sendMessage(T, 'test', 'WhatsApp', '919812300001', 'hi');
  assert(wa.channel === 'WhatsApp' && !wa.ok && wa.status === 'Failed', `WhatsApp fails gracefully offline (got ${wa.status})`);
  const em = await sendMessage(T, 'test', 'Email', 'anita@example.com', 'hi', { subject: 'Test' });
  assert(em.ok && em.status === 'Sent' && /offline/.test(em.detail), `Email logs offline (got ${em.detail})`);
  const sm = await sendMessage(T, 'test', 'SMS', '919812300001', 'hi');
  assert(sm.ok && sm.status === 'Sent', 'SMS logs offline');
  const empty = await sendMessage(T, 'test', 'SMS', '', 'hi');
  assert(!empty.ok && empty.status === 'Skipped', 'empty recipient skipped');

  // --- Templated send ---
  const tmplWa = createRow(T, 'test', 'message_template', { name: 'Diwali WA', channel: 'WhatsApp', body: 'Namaste {{name}}! Diwali offer for you.', category: 'Festival', language: 'Hinglish', active: true });
  const ts = await sendTemplated(T, 'test', tmplWa.id, c1.id);
  assert(ts.channel === 'WhatsApp' && ts.to === '919812300001', 'sendTemplated resolves channel + recipient from template/party');

  // --- Campaign: blast an SMS template to all customers, track touches ---
  const camp = createRow(T, 'test', 'campaign', { name: 'Retail Reopen', channel: 'SMS', status: 'Active' });
  const tmplSms = createRow(T, 'test', 'message_template', { name: 'Reopen SMS', channel: 'SMS', body: 'Hi {{name}}, we are open!', category: 'Marketing', active: true });
  const res = await runCampaign(T, 'test', camp.id, { templateId: tmplSms.id, audience: 'all_customers' });
  assert(res.total === 3, `campaign targets 3 customers (got ${res.total})`);
  assert(res.sent === 2, `2 sent (c1,c2 have phones) (got ${res.sent})`);
  assert(res.skipped === 1, `1 skipped (c3 no phone) (got ${res.skipped})`);
  assert(res.touches.length === 3, `3 touches recorded (got ${res.touches.length})`);

  // consent-only audience excludes c2 (consent:false)
  const res2 = await runCampaign(T, 'test', camp.id, { templateId: tmplSms.id, audience: 'consented' });
  assert(res2.total === 2, `consent-only targets 2 (excludes non-consenting) (got ${res2.total})`);

  // leads audience
  const res3 = await runCampaign(T, 'test', camp.id, { templateId: tmplSms.id, audience: 'leads' });
  assert(res3.total === 1 && res3.sent === 1, `leads audience targets the 1 open lead (got ${res3.total}/${res3.sent})`);

  // --- Campaign stats ---
  const stats = campaignStats(T, camp.id);
  assert(stats.total === 6, `stats aggregate all touches across runs (got ${stats.total})`);
  assert(stats.sent >= 4, `stats count sent (got ${stats.sent})`);

  // --- Notification center ---
  notify(T, { title: 'Test task', kind: 'Task', severity: 'info', for_user: 'ravi@epic.local' });
  notify(T, { title: 'System alert', kind: 'Alert', severity: 'warning' });
  const all = listNotifications(T);
  assert(all.length === 2, `2 notifications listed (got ${all.length})`);
  const forRavi = listNotifications(T, { user: 'ravi@epic.local' });
  assert(forRavi.length === 2, `user sees own + broadcast notifications (got ${forRavi.length})`);
  const unread = listNotifications(T, { unreadOnly: true });
  assert(unread.length === 2, 'both unread initially');
  markNotificationRead(T, all[0].id);
  assert(listNotifications(T, { unreadOnly: true }).length === 1, 'mark one read → 1 unread');
  const marked = markAllRead(T);
  assert(marked === 1 && listNotifications(T, { unreadOnly: true }).length === 0, 'mark all read → 0 unread');

  // --- Alert sync (idempotent) ---
  const alerts = [{ type: 'Stock', message: 'Low stock: Cement', severity: 'warning', ref: 'ITEM-1' }];
  const created1 = syncAlertsToNotifications(T, alerts);
  const created2 = syncAlertsToNotifications(T, alerts);
  assert(created1 === 1 && created2 === 0, `alert sync is idempotent (got ${created1}, ${created2})`);

  console.log(`\nPhase-1 (P19 CRM/Engagement) self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
