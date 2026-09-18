// Foreground self-test #23: CRM depth — scoring, activities, duplicates/merge,
// lead -> opportunity -> quotation conversion, weighted pipeline + forecast, analytics.
// Runs the kernel directly (no server) on isolated tenant 'TCRM'.
import { createRow, submitRow } from './kernel/entity-service.js';
import {
  scoreLead, scoreAllLeads, logActivity, activitiesFor, findDuplicateLeads, mergeLeads,
  convertLead, winOpportunity, loseOpportunity, getPipeline, getForecast,
  getSourceAnalytics, getLostReasonPareto, getOwnerPerformance, assignOwner,
} from './modules/crm/crm.js';
import { store } from './kernel/store.js';

const T = 'TCRM';
let fails = 0;
function assert(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; }

async function main() {
  // --- Masters: territory + sales team (for assignment) ---
  const ter = createRow(T, 'test', 'territory', { name: 'Karnataka', state: '29', manager: 'priya@epic.local' });
  const team = createRow(T, 'test', 'sales_team', { name: 'South', members: 'ravi@epic.local, anil@epic.local', assignment_rule: 'Load Based' });
  createRow(T, 'test', 'lost_reason', { name: 'Price too high' });

  // --- A high-intent lead ---
  const hot = createRow(T, 'test', 'lead', {
    name: 'Ramesh', org: 'Ramesh Steels', phone: '+91 98765 43210', email: 'ramesh@steels.in',
    gstin: '29ABCDE1234F1Z5', source: 'IndiaMART', stage: 'Qualified', expected_value: 250000,
    consent: true, territory: ter.id, sales_team: team.id,
  });
  // --- A weak lead ---
  const cold = createRow(T, 'test', 'lead', {
    name: 'Walkin', source: 'Walk-in', stage: 'New', expected_value: 5000,
  });

  // --- Scoring ---
  const hotScore = scoreLead(T, hot.id);
  const coldScore = scoreLead(T, cold.id);
  assert(hotScore.band === 'Hot', `high-intent lead scores Hot (got ${hotScore.band}/${hotScore.score})`);
  assert(coldScore.score < hotScore.score, `weak lead scores lower (${coldScore.score} < ${hotScore.score})`);
  const ranked = scoreAllLeads(T);
  assert(ranked[0].leadId === hot.id, 'scoreAllLeads ranks the hot lead first');

  // --- Activities bump the score (engagement) ---
  const before = store.getRow(T, cold.id)!.data.score;
  logActivity(T, 'test', { activity_type: 'Call', ref_entity: 'lead', ref_id: cold.id, subject: 'Intro call', direction: 'Outbound' });
  logActivity(T, 'test', { activity_type: 'WhatsApp', ref_entity: 'lead', ref_id: cold.id, subject: 'Sent catalog' });
  const after = scoreLead(T, cold.id).score;
  assert(after > before, `activities raise score (${before} -> ${after})`);
  assert(activitiesFor(T, 'lead', cold.id).length === 2, 'timeline shows 2 activities');
  assert(!!store.getRow(T, cold.id)!.data.last_activity_date, 'last_activity_date stamped on lead');

  // --- Assignment (load-based over team members) ---
  const owner = assignOwner(T, hot.id);
  assert(['ravi@epic.local', 'anil@epic.local', 'priya@epic.local'].includes(owner), `assigned an owner (got ${owner})`);
  // territory manager wins when present
  assert(owner === 'priya@epic.local', 'territory manager takes assignment when set');

  // --- Duplicate detection + merge (same phone, different record) ---
  const dup = createRow(T, 'test', 'lead', { name: 'Ramesh (dup)', phone: '9876543210', source: 'Website', stage: 'New' });
  const dupes = findDuplicateLeads(T);
  assert(dupes.some((d) => d.leadIds.includes(hot.id) && d.leadIds.includes(dup.id)), 'duplicate detected by phone (normalized)');
  const merge = mergeLeads(T, 'test', hot.id, [dup.id]);
  assert(merge.merged.includes(dup.id), 'duplicate merged into primary');
  assert(store.getRow(T, dup.id)!.data.duplicate_of === hot.id, 'duplicate marked duplicate_of primary');
  assert(!findDuplicateLeads(T).some((d) => d.leadIds.includes(dup.id)), 'merged dup no longer flagged');

  // --- Conversion: lead -> party + opportunity + quotation ---
  const conv = convertLead(T, 'test', hot.id, { createQuotation: true });
  assert(conv.party.data.is_customer === true, 'conversion creates/links a customer party');
  assert(conv.opportunity.entity === 'opportunity' && conv.opportunity.data.customer === conv.party.id, 'opportunity created + linked to party');
  assert(!!conv.quotation && conv.quotation.entity === 'quotation', 'quotation created on convert');
  assert(store.getRow(T, hot.id)!.data.converted === true, 'lead marked converted');
  // no duplicate party master on a second convert attempt (should error, already converted)
  let reconvErr = false;
  try { convertLead(T, 'test', hot.id); } catch { reconvErr = true; }
  assert(reconvErr, 're-converting a converted lead is rejected');

  // --- Opportunity posting computes weighted value on submit ---
  const opp = conv.opportunity;
  submitRow(T, 'test', 'opportunity', opp.id);
  const posted = store.getRow(T, opp.id)!;
  assert(posted.data.weighted_value === 25000, `weighted value = value*prob (250000*10% = 25000, got ${posted.data.weighted_value})`);
  assert(store.glOf(T).filter((g) => g.voucher === opp.id).length === 0, 'opportunity posts NO GL (forecast only)');

  // --- Pipeline + forecast rollups ---
  const opp2 = createRow(T, 'test', 'opportunity', { title: 'Big deal', customer: conv.party.id, stage: 'Negotiation', expected_value: 400000, owner: 'ravi@epic.local' });
  submitRow(T, 'test', 'opportunity', opp2.id);
  const pipe = getPipeline(T);
  assert(pipe['Qualification'].count === 1 && pipe['Negotiation'].count === 1, 'pipeline groups opps by stage');
  const fc = getForecast(T);
  assert(fc.openCount === 2, `forecast counts 2 open opps (got ${fc.openCount})`);
  assert(fc.openValue === 650000, `forecast open value = 650000 (got ${fc.openValue})`);
  assert(fc.commit === 400000, `commit = late-stage only (Negotiation 75% => 400000, got ${fc.commit})`);
  assert(Math.abs(fc.weightedForecast - (25000 + 300000)) < 1, `weighted forecast = 325000 (got ${fc.weightedForecast})`);

  // --- Win / lose ---
  winOpportunity(T, 'test', opp2.id);
  assert(store.getRow(T, opp2.id)!.data.stage === 'Won', 'opportunity moved to Won');
  loseOpportunity(T, 'test', opp.id, 'Price too high');
  assert(store.getRow(T, opp.id)!.data.stage === 'Lost', 'opportunity moved to Lost');

  // --- Analytics ---
  const src = getSourceAnalytics(T);
  assert(src.some((s) => s.source === 'IndiaMART' && s.won >= 1), 'source analytics attributes the IndiaMART win');
  const pareto = getLostReasonPareto(T);
  assert(pareto.some((p) => p.reason === 'Price too high' && p.count === 1), 'lost-reason pareto counts the loss');
  const owners = getOwnerPerformance(T);
  assert(owners.some((o) => o.owner === 'ravi@epic.local' && o.won === 400000), 'owner leaderboard credits the won deal');

  console.log(`\nCRM-depth self-test complete. ${fails === 0 ? 'ALL PASS ✅' : fails + ' FAILURES ❌'}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
