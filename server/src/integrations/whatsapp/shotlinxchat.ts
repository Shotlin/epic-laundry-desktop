import type { WhatsAppConnector, SendResult } from './connector.js';

// Adapter for the founder's `shotlinXchat` (WhatsAPI) — Fastify + Baileys, freeform-only.
// API contract from https://github.com/sayanm085/shotlinXchat (README).
export class ShotlinXchatAdapter implements WhatsAppConnector {
  name = 'shotlinXchat';
  private base: string;
  private key: string;

  constructor(base = process.env.SHOTLINXCHAT_URL || 'http://localhost:3000', key = process.env.SHOTLINXCHAT_API_KEY || '') {
    this.base = base.replace(/\/$/, '');
    this.key = key;
  }

  private headers() {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.key) h['X-API-Key'] = this.key;
    return h;
  }

  private async call(path: string, body?: any): Promise<SendResult> {
    try {
      const res = await fetch(this.base + path, {
        method: body ? 'POST' : 'GET',
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      return { ok: res.ok, detail: res.status.toString(), raw: json };
    } catch (e: any) {
      return { ok: false, detail: e?.message || 'fetch failed' };
    }
  }

  async sendText(to: string, message: string): Promise<SendResult> {
    return this.call('/api/v1/send', { to, message });
  }

  async sendMediaUrl(to: string, type: 'image' | 'video' | 'audio' | 'document', url: string, caption?: string): Promise<SendResult> {
    return this.call('/api/v1/media', { to, type, url, caption });
  }

  async getQr(): Promise<{ ok: boolean; qr?: string; status?: string }> {
    try {
      const res = await fetch(this.base + '/qr', { headers: this.headers() });
      const j = await res.json().catch(() => ({}));
      return { ok: res.ok, qr: j?.qr || j?.code, status: j?.status };
    } catch (e: any) {
      return { ok: false, status: e?.message };
    }
  }

  async setWebhook(url: string): Promise<SendResult> {
    return this.call('/api/v1/webhook', { url });
  }
}
