// Deterministic sandbox GSP. Mirrors the IRP response SHAPE so the entire e-invoice -> e-way ->
// IMS lifecycle runs end-to-end with zero credentials. IRNs are derived from a stable hash of the
// document number + seller GSTIN (exactly how the IRP would return a unique, verifiable IRN).
import { createHash } from 'node:crypto';
import type { EinvoiceResult, EwbResult, GspConnector, InwardSupply, ImsActionCode } from './connector.js';

function irnOf(docNo: string, gstin: string): string {
  return createHash('sha256').update(`${gstin}|${docNo}`).digest('hex').toUpperCase();
}

// A tiny SVG QR placeholder (real IRP returns a signed QR PNG; this renders in the browser).
function qrDataUrl(text: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>` +
    `<rect width='120' height='120' fill='white'/>` +
    `<text x='10' y='62' font-size='9' font-family='monospace'>${text.slice(0, 32)}…</text>` +
    `<text x='10' y='80' font-size='7' fill='#666'>sandbox IRN</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class SandboxGspConnector implements GspConnector {
  async generateIrn(payload: any, company: { gstin: string }): Promise<EinvoiceResult> {
    const docNo = payload?.DocDtls?.No || 'DOC';
    const irn = irnOf(docNo, company.gstin);
    const ackDt = new Date().toISOString();
    return {
      irn,
      ackNo: 'SBX' + irn.slice(0, 12),
      ackDt,
      signedInvoice: 'SANDBOX-SIGNED-' + irn,
      signedQr: qrDataUrl(irn),
      status: 'GENERATED',
    };
  }

  async cancelIrn(irn: string, reason: string): Promise<{ cancelled: boolean; irn: string }> {
    return { cancelled: true, irn };
  }

  async generateEwb(payload: any, company: { gstin: string }): Promise<EwbResult> {
    const seq = createHash('sha256').update(company.gstin + (payload?.docNo || '')).digest('hex').slice(0, 12).toUpperCase();
    const now = Date.now();
    const validUntil = new Date(now + 1000 * 60 * 60 * 24 * 4).toISOString();
    return {
      ewbNo: '31' + seq.slice(0, 10),
      ewbDate: new Date(now).toISOString(),
      validUntil,
      status: 'GENERATED',
    };
  }

  async getInwardSupplies(period: string): Promise<InwardSupply[]> {
    // In sandbox we return a couple of sample 2A/2B inward supplies so IMS matching is demonstrable.
    return [
      {
        irn: irnOf('BILL/2026/101', '29UVX7843W1Z2'),
        supplierGstin: '29UVX7843W1Z2', supplierName: 'Bengaluru Plywood Mart',
        docNo: 'BILL/2026/101', docDate: '2026-07-02',
        taxable: 40000, cgst: 3600, sgst: 3600, igst: 0, total: 47200, status: 'PENDING',
      },
      {
        irn: irnOf('INV/2026/55', '27AAACX9876Q1Z9'),
        supplierGstin: '27AAACX9876Q1Z9', supplierName: 'Mumbai Packers Pvt Ltd',
        docNo: 'INV/2026/55', docDate: '2026-07-05',
        taxable: 25000, cgst: 0, sgst: 0, igst: 4500, total: 29500, status: 'PENDING',
      },
    ];
  }

  async pushImsAction(irn: string, action: ImsActionCode, reason?: string): Promise<{ ok: boolean; irn: string }> {
    return { ok: true, irn };
  }
}
