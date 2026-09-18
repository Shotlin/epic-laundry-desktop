// Real GSP/IRP REST adapter. Wired to the NIC e-Invoice / e-Way Bill / IMS common endpoints.
// Requires credentials (register with a GSP or the NIC sandbox): GSP_BASE_URL, GSP_AUTH_TOKEN,
// GSP_ID. The request/response shapes follow the e-Invoice v1.1 / EWB v1.0.1 / IMS v1.0 specs.
//
// NOTE: this path is NOT exercised in Phase 0 (no creds). It exists so "go live" is a config flip
// (GSP_PROVIDER=rest) — same philosophy as the WhatsApp connector.
import type { EinvoiceResult, EwbResult, GspConnector, InwardSupply, ImsActionCode } from './connector.js';

const BASE = process.env.GSP_BASE_URL || 'https://einvoice1.gst.gov.in';
const TOKEN = process.env.GSP_AUTH_TOKEN || '';
const GSP_ID = process.env.GSP_ID || '';

async function gspFetch(path: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      'gstin': headers.gstin || '',
      'gsp_id': GSP_ID,
      'api_key': GSP_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text, ok: res.ok }; }
}

export class RestGspConnector implements GspConnector {
  async generateIrn(payload: any, company: { gstin: string }): Promise<EinvoiceResult> {
    const r: any = await gspFetch(
      '/einv/v1/Invoice?action=generate', payload, { gstin: company.gstin });
    return {
      irn: r.irn, ackNo: r.AckNo, ackDt: r.AckDt,
      signedInvoice: r.SignedInvoice, signedQr: r.SignedQRCode, status: 'GENERATED',
    };
  }

  async cancelIrn(irn: string, reason: string, rsnCode = '1'): Promise<{ cancelled: boolean; irn: string }> {
    const r: any = await gspFetch('/einv/v1/Invoice/Cancel?action=cancel', {
      Irn: irn, CnlRsn: rsnCode, CnlRem: reason,
    });
    return { cancelled: !!r.Irn, irn };
  }

  async generateEwb(payload: any, company: { gstin: string }): Promise<EwbResult> {
    const r: any = await gspFetch(
      '/eiewb/v1.0.1/ewayapi?action=GENEWAYBILL', payload, { gstin: company.gstin });
    return { ewbNo: r.ewbNo, ewbDate: r.ewbDate, validUntil: r.validUpto, status: 'GENERATED' };
  }

  async getInwardSupplies(period: string): Promise<InwardSupply[]> {
    const [fy, month] = period.split('-');
    const r: any = await gspFetch('/ims/v1.0/inward-supplies', {
      Period: `${month}-${fy}`, Action: 'GETIMSDATA',
    }, { gstin: process.env.EPIC_SUPPLIER_GSTIN || '' });
    const out = (r?.data || []) as any[];
    return out.map((x) => ({
      irn: x.irn, supplierGstin: x.supplierGstin, supplierName: x.supplierName,
      docNo: x.docNo, docDate: x.docDate,
      taxable: Number(x.taxable || 0), cgst: Number(x.cgst || 0),
      sgst: Number(x.sgst || 0), igst: Number(x.igst || 0), total: Number(x.total || 0),
      status: x.status || 'PENDING',
    }));
  }

  async pushImsAction(irn: string, action: ImsActionCode, reason?: string): Promise<{ ok: boolean; irn: string }> {
    const r: any = await gspFetch('/ims/v1.0/ims-action', {
      Irn: irn, Action: action, Reason: reason || '',
    }, { gstin: process.env.EPIC_SUPPLIER_GSTIN || '' });
    return { ok: !!r?.Status || r?.ok === true, irn };
  }
}
