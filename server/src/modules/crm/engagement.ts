// P19 CRM/Engagement depth — the "real communications" layer the portfolio flags as remaining.
// A channel-agnostic gateway (WhatsApp via shotlinXchat live; Email/SMS deterministic offline,
// live when creds are set), template rendering with {{merge}} fields, campaign execution with
// per-recipient touch tracking, and an internal notification center.
// India-first: WhatsApp is the primary channel; everything works fully offline (queued/logged)
// so the desktop app never blocks on the network.
import { store } from '../../kernel/store.js';
import { createRow } from '../../kernel/entity-service.js';
import { audit } from '../../kernel/audit.js';
import { ShotlinXchatAdapter } from '../../integrations/whatsapp/shotlinxchat.js';
import type { EntityRow } from '../../kernel/types.js';

export type Channel = 'WhatsApp' | 'Email' | 'SMS';

export interface SendOutcome {
  ok: boolean;
  channel: Channel;
  to: string;
  status: 'Sent' | 'Delivered' | 'Failed' | 'Skipped';
  detail: string;
}

// ---- Template rendering: {{name}}, {{org}}, {{amount}}, {{invoice}}, {{due_date}} etc. ----
export function renderTemplate(body: string, vars: Record<string, any>): string {
  return String(body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : '');
}

// Build the merge-field map for a party/lead (name, org, phone, and any explicit extras).
export function mergeVarsFor(tenant: string, refId: string | undefined, extra?: Record<string, any>): Record<string, any> {
  const base: Record<string, any> = { name: 'Customer', org: '', phone: '' };
  if (refId) {
    const row = store.getRow(tenant, refId);
    if (row) {
      base.name = row.data.name || row.data.org || 'Customer';
      base.org = row.data.org || row.data.name || '';
      base.phone = row.data.phone || '';
      base.email = row.data.email || '';
      base.gstin = row.data.gstin || '';
    }
  }
  return { ...base, ...(extra || {}) };
}

// ---- The gateway: one entry point for every outbound message on every channel. ----
// WhatsApp -> shotlinXchat (live when running). Email/SMS -> live provider when configured
// (EPIC_SMTP_URL / EPIC_SMS_URL), else a deterministic "logged" outcome so the app is fully
// usable offline and in tests. Every send is audited.
export async function sendMessage(
  tenant: string, actor: string, channel: Channel, to: string, message: string, opts?: { subject?: string },
): Promise<SendOutcome> {
  const dest = String(to || '').trim();
  if (!dest) return { ok: false, channel, to: '', status: 'Skipped', detail: 'no recipient' };
  if (!message?.trim()) return { ok: false, channel, to: dest, status: 'Skipped', detail: 'empty message' };

  let outcome: SendOutcome;
  if (channel === 'WhatsApp') {
    const wa = new ShotlinXchatAdapter();
    const res = await wa.sendText(dest, message);
    outcome = { ok: res.ok, channel, to: dest, status: res.ok ? 'Sent' : 'Failed', detail: res.detail || (res.ok ? 'sent' : 'failed') };
  } else if (channel === 'Email') {
    outcome = await sendEmail(dest, opts?.subject || 'Message from Epic BOS', message);
  } else {
    outcome = await sendSms(dest, message);
  }

  audit(tenant, actor, `engage:send:${channel.toLowerCase()}`, {
    entity: 'message', after: { to: dest, ok: outcome.ok, status: outcome.status, detail: outcome.detail },
  });
  return outcome;
}

// Email: POST to EPIC_SMTP_URL (a mail relay/webhook) when set, else deterministic offline log.
async function sendEmail(to: string, subject: string, body: string): Promise<SendOutcome> {
  const url = process.env.EPIC_SMTP_URL;
  if (!url) return { ok: true, channel: 'Email', to, status: 'Sent', detail: 'logged (offline: set EPIC_SMTP_URL to go live)' };
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body }),
    });
    return { ok: res.ok, channel: 'Email', to, status: res.ok ? 'Sent' : 'Failed', detail: `smtp ${res.status}` };
  } catch (e: any) {
    return { ok: false, channel: 'Email', to, status: 'Failed', detail: e?.message || 'smtp error' };
  }
}

// SMS: POST to EPIC_SMS_URL (DLT-registered Indian SMS gateway) when set, else offline log.
async function sendSms(to: string, body: string): Promise<SendOutcome> {
  const url = process.env.EPIC_SMS_URL;
  if (!url) return { ok: true, channel: 'SMS', to, status: 'Sent', detail: 'logged (offline: set EPIC_SMS_URL to go live)' };
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, body }),
    });
    return { ok: res.ok, channel: 'SMS', to, status: res.ok ? 'Sent' : 'Failed', detail: `sms ${res.status}` };
  } catch (e: any) {
    return { ok: false, channel: 'SMS', to, status: 'Failed', detail: e?.message || 'sms error' };
  }
}

// Send using a saved template to a party/lead, rendering merge fields from that record.
export async function sendTemplated(
  tenant: string, actor: string, templateId: string, refId: string, extra?: Record<string, any>,
): Promise<SendOutcome> {
  const tmpl = store.getRow(tenant, templateId);
  if (!tmpl || tmpl.entity !== 'message_template') throw new Error('template not found');
  const vars = mergeVarsFor(tenant, refId, extra);
  const body = renderTemplate(tmpl.data.body, vars);
  const to = tmpl.data.channel === 'Email' ? vars.email : vars.phone;
  return sendMessage(tenant, actor, tmpl.data.channel, to, body, { subject: renderTemplate(tmpl.data.subject || '', vars) });
}

// ---- Campaign execution: blast a template to an audience, tracking each recipient as a touch. ----
export interface CampaignResult {
  campaign: string; channel: Channel; total: number; sent: number; failed: number; skipped: number;
  touches: string[];
}

export async function runCampaign(
  tenant: string, actor: string, campaignId: string,
  opts: { templateId: string; audience?: 'all_customers' | 'leads' | 'consented'; consentOnly?: boolean },
): Promise<CampaignResult> {
  const camp = store.getRow(tenant, campaignId);
  if (!camp || camp.entity !== 'campaign') throw new Error('campaign not found');
  const tmpl = store.getRow(tenant, opts.templateId);
  if (!tmpl || tmpl.entity !== 'message_template') throw new Error('template not found');
  const channel = tmpl.data.channel as Channel;

  // Build the audience (India-first: consent matters for marketing / DLT).
  const audience = opts.audience || 'all_customers';
  let recipients: { refId: string; isLead: boolean }[] = [];
  if (audience === 'leads') {
    recipients = store.rowsOf(tenant, 'lead').filter((l) => !l.data.converted).map((l) => ({ refId: l.id, isLead: true }));
  } else {
    recipients = store.rowsOf(tenant, 'party')
      .filter((p) => p.data.is_customer)
      .filter((p) => (opts.consentOnly || audience === 'consented') ? p.data.consent !== false : true)
      .map((p) => ({ refId: p.id, isLead: false }));
  }

  const result: CampaignResult = { campaign: campaignId, channel, total: recipients.length, sent: 0, failed: 0, skipped: 0, touches: [] };

  for (const r of recipients) {
    const vars = mergeVarsFor(tenant, r.refId);
    const body = renderTemplate(tmpl.data.body, vars);
    const to = channel === 'Email' ? vars.email : vars.phone;
    let outcome: SendOutcome;
    if (!to) {
      outcome = { ok: false, channel, to: '', status: 'Skipped', detail: `no ${channel === 'Email' ? 'email' : 'phone'}` };
      result.skipped++;
    } else {
      outcome = await sendMessage(tenant, actor, channel, to, body, { subject: renderTemplate(tmpl.data.subject || '', vars) });
      if (outcome.status === 'Skipped') result.skipped++;
      else if (outcome.ok) result.sent++;
      else result.failed++;
    }
    const touch = createRow(tenant, actor, 'campaign_touch', {
      campaign: campaignId, channel, template: opts.templateId,
      party: r.isLead ? undefined : r.refId, lead: r.isLead ? r.refId : undefined,
      recipient: outcome.to, status: outcome.status, detail: outcome.detail,
      sent_at: new Date().toISOString(),
    });
    result.touches.push(touch.id);
  }

  audit(tenant, actor, 'engage:campaign-run', { entity: 'campaign', row_id: campaignId, after: { ...result, touches: result.touches.length } });
  return result;
}

// Per-campaign stats derived from the recorded touches (for the campaign dashboard).
export function campaignStats(tenant: string, campaignId: string) {
  const touches = store.rowsOf(tenant, 'campaign_touch').filter((t) => t.data.campaign === campaignId);
  const by = (s: string) => touches.filter((t) => t.data.status === s).length;
  const sent = by('Sent') + by('Delivered');
  return {
    total: touches.length, sent, delivered: by('Delivered'), failed: by('Failed'), skipped: by('Skipped'),
    reach: touches.length ? Math.round((sent / touches.length) * 100) : 0,
  };
}

// ---- Notification center (internal, in-app) ----
export function notify(
  tenant: string, input: { title: string; body?: string; kind?: string; severity?: string; for_user?: string; ref_entity?: string; ref_id?: string },
): EntityRow {
  return createRow(tenant, 'system', 'notification', {
    title: input.title, body: input.body || '', kind: input.kind || 'System',
    severity: input.severity || 'info', for_user: input.for_user || '',
    ref_entity: input.ref_entity || '', ref_id: input.ref_id || '', read: false,
  });
}

export function listNotifications(tenant: string, opts?: { unreadOnly?: boolean; user?: string }): EntityRow[] {
  return store.rowsOf(tenant, 'notification')
    .filter((n) => (!opts?.user || !n.data.for_user || n.data.for_user === opts.user))
    .filter((n) => (opts?.unreadOnly ? !n.data.read : true))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function markNotificationRead(tenant: string, id: string, read = true): EntityRow {
  const n = store.getRow(tenant, id);
  if (!n || n.entity !== 'notification') throw new Error('notification not found');
  n.data.read = read;
  n.updated_at = new Date().toISOString();
  store.updateRow(n);
  return n;
}

export function markAllRead(tenant: string, user?: string): number {
  let count = 0;
  for (const n of listNotifications(tenant, { unreadOnly: true, user })) {
    n.data.read = true; n.updated_at = new Date().toISOString(); store.updateRow(n); count++;
  }
  return count;
}

// Convert the existing ops alerts (overdue receivables, low stock, GST due dates) into
// notification-center entries so owners see them in one inbox. Idempotent by title+ref.
export function syncAlertsToNotifications(tenant: string, alerts: { type: string; message: string; severity?: string; ref?: string }[]): number {
  const existing = new Set(store.rowsOf(tenant, 'notification').map((n) => `${n.data.title}|${n.data.ref_id || ''}`));
  let created = 0;
  for (const a of alerts) {
    const key = `${a.message}|${a.ref || ''}`;
    if (existing.has(key)) continue;
    notify(tenant, { title: a.message, kind: 'Alert', severity: a.severity || 'warning', ref_id: a.ref });
    created++;
  }
  return created;
}
