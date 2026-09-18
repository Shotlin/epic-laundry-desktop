// WhatsApp connector abstraction (docs/02-architecture/07-whatsapp-integration.md).
// shortlinXchat (WhatsAPI / Baileys) is the first implementation; Meta Cloud API would be a
// second, behind the same interface. The rest of the product only talks to this interface.

export interface SendResult {
  ok: boolean;
  detail?: string;
  raw?: any;
}

export interface WhatsAppConnector {
  name: string;
  sendText(to: string, message: string): Promise<SendResult>;
  sendMediaUrl(to: string, type: 'image' | 'video' | 'audio' | 'document', url: string, caption?: string): Promise<SendResult>;
  getQr(): Promise<{ ok: boolean; qr?: string; status?: string }>;
  setWebhook(url: string): Promise<SendResult>;
}
