// Epic BOS CRM depth — the pipeline brain the docs (docs/03-modules/01-crm.md) specify but
// the Phase-0 kernel shipped only as a bare `lead`. Pure TypeScript over the metadata kernel:
// lead scoring, duplicate detection + merge, activity timeline, lead -> opportunity -> quotation
// conversion, weighted pipeline + forecast rollups, and source/owner analytics.
// India-first: WhatsApp/IndiaMART/JustDial/Missed-Call sources are first-class, values in ₹.
import { store } from '../../kernel/store.js';
import { createRow } from '../../kernel/entity-service.js';
import { audit } from '../../kernel/audit.js';
import type { EntityRow } from '../../kernel/types.js';

// The `opportunity_posting` hook (weighted-value computation, no GL) is registered in
// kernel/posting.ts alongside the other document hooks so it loads with the kernel.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- Lead scoring (deterministic, explainable — real activity, not a black box) ----
const HOT_SOURCES = ['Referral', 'IndiaMART', 'WhatsApp'];
const WARM_SOURCES = ['Website', 'JustDial', 'Campaign'];

export interface ScoreResult { score: number; band: 'Hot' | 'Warm' | 'Cold'; reasons: string[] }

export function scoreLead(tenant: string, leadId: string): ScoreResult {
  const lead = store.getRow(tenant, leadId);
  if (!lead || lead.entity !== 'lead') throw new Error('lead not found');
  const d = lead.data;
  let score = 0;
  const reasons: string[] = [];

  // Contactability
  if (d.phone) { score += 15; reasons.push('+15 has phone'); }
  if (d.email) { score += 10; reasons.push('+10 has email'); }
  if (d.gstin) { score += 15; reasons.push('+15 GSTIN present (real business)'); }
  if (d.consent) { score += 10; reasons.push('+10 opted-in (consent)'); }

  // Source quality
  if (HOT_SOURCES.includes(d.source)) { score += 20; reasons.push(`+20 high-intent source (${d.source})`); }
  else if (WARM_SOURCES.includes(d.source)) { score += 10; reasons.push(`+10 warm source (${d.source})`); }

  // Deal size
  const val = Number(d.expected_value) || 0;
  if (val >= 100000) { score += 20; reasons.push('+20 large deal (≥₹1L)'); }
  else if (val >= 25000) { score += 10; reasons.push('+10 mid deal (≥₹25k)'); }

  // Engagement — real activities logged against this lead
  const acts = activitiesFor(tenant, 'lead', leadId);
  const engagement = Math.min(20, acts.length * 5);
  if (engagement > 0) { score += engagement; reasons.push(`+${engagement} engagement (${acts.length} activities)`); }

  // Stage progression
  const stageBonus: Record<string, number> = { New: 0, Contacted: 5, Qualified: 10, Proposal: 15, Won: 20, Lost: -30 };
  const sb = stageBonus[d.stage] ?? 0;
  if (sb !== 0) { score += sb; reasons.push(`${sb >= 0 ? '+' : ''}${sb} stage (${d.stage})`); }

  score = Math.max(0, Math.min(100, score));
  const band: ScoreResult['band'] = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold';

  d.score = score;
  d.score_band = band;
  lead.updated_at = new Date().toISOString();
  store.updateRow(lead);
  return { score, band, reasons };
}

export function scoreAllLeads(tenant: string): { leadId: string; score: number; band: string }[] {
  return store.rowsOf(tenant, 'lead')
    .filter((l) => !l.data.converted && l.data.stage !== 'Lost')
    .map((l) => { const s = scoreLead(tenant, l.id); return { leadId: l.id, score: s.score, band: s.band }; })
    .sort((a, b) => b.score - a.score);
}

// ---- Activities (timeline) ----
export function logActivity(tenant: string, actor: string, input: {
  activity_type: string; ref_entity: string; ref_id: string; subject: string;
  body?: string; direction?: string; due_date?: string; owner?: string; done?: boolean;
}): EntityRow {
  const row = createRow(tenant, actor, 'crm_activity', input);
  // stamp last_activity_date on the referenced lead/opportunity
  const ref = store.getRow(tenant, input.ref_id);
  if (ref && (ref.entity === 'lead' || ref.entity === 'opportunity')) {
    ref.data.last_activity_date = new Date().toISOString().slice(0, 10);
    ref.updated_at = new Date().toISOString();
    store.updateRow(ref);
  }
  return row;
}

export function activitiesFor(tenant: string, refEntity: string, refId: string): EntityRow[] {
  return store.rowsOf(tenant, 'crm_activity')
    .filter((a) => a.data.ref_id === refId && (!refEntity || a.data.ref_entity === refEntity))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// ---- Duplicate detection + merge ----
function normPhone(p?: string): string { return String(p || '').replace(/\D/g, '').replace(/^0+/, '').slice(-10); }

export function findDuplicateLeads(tenant: string): { key: string; leadIds: string[] }[] {
  const byKey: Record<string, string[]> = {};
  for (const l of store.rowsOf(tenant, 'lead')) {
    if (l.data.duplicate_of) continue;
    const phone = normPhone(l.data.phone);
    const gstin = String(l.data.gstin || '').trim().toUpperCase();
    const email = String(l.data.email || '').trim().toLowerCase();
    for (const key of [phone && `p:${phone}`, gstin && `g:${gstin}`, email && `e:${email}`].filter(Boolean) as string[]) {
      (byKey[key] ||= []).push(l.id);
    }
  }
  return Object.entries(byKey).filter(([, ids]) => ids.length > 1).map(([key, leadIds]) => ({ key, leadIds }));
}

export function mergeLeads(tenant: string, actor: string, primaryId: string, duplicateIds: string[]): { primary: string; merged: string[] } {
  const primary = store.getRow(tenant, primaryId);
  if (!primary || primary.entity !== 'lead') throw new Error('primary lead not found');
  const merged: string[] = [];
  for (const dupId of duplicateIds) {
    if (dupId === primaryId) continue;
    const dup = store.getRow(tenant, dupId);
    if (!dup || dup.entity !== 'lead') continue;
    // move activities to the primary
    for (const act of activitiesFor(tenant, 'lead', dupId)) {
      act.data.ref_id = primaryId;
      act.data.body = `[merged from ${dupId}] ${act.data.body || ''}`.trim();
      store.updateRow(act);
    }
    // fill any blanks on the primary from the duplicate (non-destructive)
    for (const f of ['org', 'phone', 'email', 'gstin', 'expected_value', 'notes']) {
      if (!primary.data[f] && dup.data[f]) primary.data[f] = dup.data[f];
    }
    dup.data.duplicate_of = primaryId;
    dup.data.stage = 'Lost';
    dup.status = 'Merged';
    dup.updated_at = new Date().toISOString();
    store.updateRow(dup);
    merged.push(dupId);
  }
  primary.updated_at = new Date().toISOString();
  store.updateRow(primary);
  audit(tenant, actor, 'crm:leads-merged', { entity: 'lead', row_id: primaryId, after: { merged } });
  return { primary: primaryId, merged };
}

// ---- Conversion: lead -> party + opportunity (-> quotation) ----
function defaultProbability(stage?: string): number {
  const map: Record<string, number> = {
    Qualification: 10, 'Needs Analysis': 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0,
  };
  return map[stage || ''] ?? 20;
}

export function convertLead(tenant: string, actor: string, leadId: string, opts?: { gstin?: string; createQuotation?: boolean }): {
  party: EntityRow; opportunity: EntityRow; quotation?: EntityRow;
} {
  const lead = store.getRow(tenant, leadId);
  if (!lead || lead.entity !== 'lead') throw new Error('lead not found');
  if (lead.data.converted) throw new Error('lead already converted');

  // Reuse an existing party by phone/GSTIN — principle: no duplicate customer master.
  const phone = normPhone(lead.data.phone);
  const gstin = (opts?.gstin || lead.data.gstin || '').trim().toUpperCase();
  let party = store.rowsOf(tenant, 'party').find((p) =>
    (phone && normPhone(p.data.phone) === phone) || (gstin && String(p.data.gstin || '').toUpperCase() === gstin));
  if (!party) {
    party = createRow(tenant, actor, 'party', {
      name: lead.data.org || lead.data.name,
      phone: lead.data.phone, email: lead.data.email, gstin, is_customer: true,
    });
  }

  const opp = createRow(tenant, actor, 'opportunity', {
    title: `${lead.data.org || lead.data.name} — opportunity`,
    customer: party.id, lead: lead.id, stage: 'Qualification',
    expected_value: Number(lead.data.expected_value) || 0,
    probability: defaultProbability('Qualification'),
    territory: lead.data.territory, sales_team: lead.data.sales_team,
    owner: lead.data.owner, source: lead.data.source, campaign: lead.data.campaign,
    expected_close_date: lead.data.next_activity_date,
  });

  let quotation: EntityRow | undefined;
  if (opts?.createQuotation) {
    quotation = createRow(tenant, actor, 'quotation', {
      customer: party.id,
      items: [{ item: '', qty: 1, rate: Number(lead.data.expected_value) || 0, gst_rate: 18 }],
    });
    opp.data.quotation = quotation.id;
    store.updateRow(opp);
  }

  lead.data.converted = true;
  lead.data.customer = party.id;
  lead.data.opportunity = opp.id;
  lead.data.stage = 'Qualified';
  lead.updated_at = new Date().toISOString();
  store.updateRow(lead);
  audit(tenant, actor, 'crm:lead-converted', { entity: 'lead', row_id: lead.id, after: { party: party.id, opportunity: opp.id } });
  return { party, opportunity: opp, quotation };
}

// Move an opportunity to Won -> hand off to a submitted quotation (sales takes over).
export function winOpportunity(tenant: string, actor: string, oppId: string): { opportunity: EntityRow } {
  const opp = store.getRow(tenant, oppId);
  if (!opp || opp.entity !== 'opportunity') throw new Error('opportunity not found');
  opp.data.stage = 'Won';
  opp.data.probability = 100;
  opp.data.weighted_value = Number(opp.data.expected_value) || 0;
  opp.updated_at = new Date().toISOString();
  store.updateRow(opp);
  audit(tenant, actor, 'crm:opportunity-won', { entity: 'opportunity', row_id: oppId });
  return { opportunity: opp };
}

export function loseOpportunity(tenant: string, actor: string, oppId: string, lostReason: string): { opportunity: EntityRow } {
  const opp = store.getRow(tenant, oppId);
  if (!opp || opp.entity !== 'opportunity') throw new Error('opportunity not found');
  opp.data.stage = 'Lost';
  opp.data.probability = 0;
  opp.data.weighted_value = 0;
  opp.data.lost_reason = lostReason;
  opp.updated_at = new Date().toISOString();
  store.updateRow(opp);
  audit(tenant, actor, 'crm:opportunity-lost', { entity: 'opportunity', row_id: oppId, after: { lostReason } });
  return { opportunity: opp };
}

// ---- Pipeline + forecast rollups ----
const OPEN_STAGES = ['Qualification', 'Needs Analysis', 'Proposal', 'Negotiation'];

export function getPipeline(tenant: string, filter?: { owner?: string; territory?: string; sales_team?: string }) {
  const opps = store.rowsOf(tenant, 'opportunity').filter((o) => {
    if (filter?.owner && o.data.owner !== filter.owner) return false;
    if (filter?.territory && o.data.territory !== filter.territory) return false;
    if (filter?.sales_team && o.data.sales_team !== filter.sales_team) return false;
    return true;
  });
  const stages: Record<string, { count: number; value: number; weighted: number }> = {};
  for (const s of [...OPEN_STAGES, 'Won', 'Lost']) stages[s] = { count: 0, value: 0, weighted: 0 };
  for (const o of opps) {
    const st = o.data.stage || 'Qualification';
    const val = Number(o.data.expected_value) || 0;
    const prob = Number(o.data.probability) || defaultProbability(st);
    (stages[st] ||= { count: 0, value: 0, weighted: 0 });
    stages[st].count++;
    stages[st].value = r2(stages[st].value + val);
    stages[st].weighted = r2(stages[st].weighted + val * prob / 100);
  }
  return stages;
}

export function getForecast(tenant: string, filter?: { owner?: string; territory?: string; sales_team?: string }) {
  const opps = store.rowsOf(tenant, 'opportunity').filter((o) => {
    if (filter?.owner && o.data.owner !== filter.owner) return false;
    if (filter?.territory && o.data.territory !== filter.territory) return false;
    if (filter?.sales_team && o.data.sales_team !== filter.sales_team) return false;
    return OPEN_STAGES.includes(o.data.stage);
  });
  let openValue = 0, weighted = 0, best = 0, commit = 0;
  for (const o of opps) {
    const val = Number(o.data.expected_value) || 0;
    const prob = Number(o.data.probability) || defaultProbability(o.data.stage);
    openValue += val;
    weighted += val * prob / 100;
    best += val;                         // best case = all open deals land
    if (prob >= 75) commit += val;       // commit = late-stage only
  }
  const won = store.rowsOf(tenant, 'opportunity')
    .filter((o) => o.data.stage === 'Won' && (!filter?.owner || o.data.owner === filter.owner))
    .reduce((a, o) => a + (Number(o.data.expected_value) || 0), 0);
  return {
    openCount: opps.length,
    openValue: r2(openValue),
    weightedForecast: r2(weighted),
    bestCase: r2(best),
    commit: r2(commit),
    wonThisPeriod: r2(won),
  };
}

// ---- Analytics: source + owner performance, lost-reason pareto ----
export function getSourceAnalytics(tenant: string) {
  const leads = store.rowsOf(tenant, 'lead');
  const bySource: Record<string, { leads: number; won: number; value: number }> = {};
  for (const l of leads) {
    const src = l.data.source || 'Other';
    (bySource[src] ||= { leads: 0, won: 0, value: 0 });
    bySource[src].leads++;
    if (l.data.stage === 'Won' || l.data.converted) bySource[src].won++;
    bySource[src].value = r2(bySource[src].value + (Number(l.data.expected_value) || 0));
  }
  return Object.entries(bySource).map(([source, v]) => ({
    source, ...v, conversion: v.leads ? r2(v.won * 100 / v.leads) : 0,
  })).sort((a, b) => b.leads - a.leads);
}

export function getLostReasonPareto(tenant: string) {
  const counts: Record<string, number> = {};
  for (const o of store.rowsOf(tenant, 'opportunity').filter((o) => o.data.stage === 'Lost')) {
    const reason = o.data.lost_reason || 'Unspecified';
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return Object.entries(counts).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

// Owner leaderboard — activities done + pipeline + won.
export function getOwnerPerformance(tenant: string) {
  const rows: Record<string, { open: number; weighted: number; won: number; activities: number }> = {};
  const bump = (o: string) => (rows[o] ||= { open: 0, weighted: 0, won: 0, activities: 0 });
  for (const o of store.rowsOf(tenant, 'opportunity')) {
    const owner = o.data.owner || 'Unassigned';
    const r = bump(owner);
    const val = Number(o.data.expected_value) || 0;
    if (OPEN_STAGES.includes(o.data.stage)) { r.open = r2(r.open + val); r.weighted = r2(r.weighted + val * (Number(o.data.probability) || 0) / 100); }
    if (o.data.stage === 'Won') r.won = r2(r.won + val);
  }
  for (const a of store.rowsOf(tenant, 'crm_activity')) bump(a.data.owner || 'Unassigned').activities++;
  return Object.entries(rows).map(([owner, v]) => ({ owner, ...v })).sort((a, b) => b.won - a.won);
}

// ---- Round-robin / territory assignment ----
export function assignOwner(tenant: string, leadId: string): string {
  const lead = store.getRow(tenant, leadId);
  if (!lead || lead.entity !== 'lead') throw new Error('lead not found');
  // territory match first
  if (lead.data.territory) {
    const ter = store.getRow(tenant, lead.data.territory);
    if (ter?.data.manager) { setOwner(lead, ter.data.manager); return ter.data.manager; }
  }
  // else round-robin over sales_team members
  if (lead.data.sales_team) {
    const team = store.getRow(tenant, lead.data.sales_team);
    const members = String(team?.data.members || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (members.length) {
      const openByOwner = (m: string) => store.rowsOf(tenant, 'lead').filter((l) => l.data.owner === m && !l.data.converted).length;
      const chosen = members.sort((a, b) => openByOwner(a) - openByOwner(b))[0]; // load-based
      setOwner(lead, chosen); return chosen;
    }
  }
  return lead.data.owner || '';
}

function setOwner(lead: EntityRow, owner: string) {
  lead.data.owner = owner;
  lead.updated_at = new Date().toISOString();
  store.updateRow(lead);
}
