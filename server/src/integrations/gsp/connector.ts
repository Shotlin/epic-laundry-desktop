// GSP connector contract (docs/05-india-compliance/01-gst.md §e-invoice/e-way/IMS).
// A GSP (GST Suvidha Provider) or the NIC IRP fronts the e-Invoice, e-Way Bill and IMS portals.
// We ship TWO implementations:
//   1. SandboxGspConnector  — deterministic fake that mirrors the IRP response shape (runs with zero creds).
//   2. RestGspConnector     — real IRP/GSP REST calls (needs GSP_BASE_URL + GSP_AUTH_TOKEN + GSP_ID).
// Going live is a one-line config change (GSP_PROVIDER=rest) — same pattern as WhatsApp.

export interface EinvoiceResult {
  irn: string;            // Invoice Reference Number (64-char hash returned by IRP)
  ackNo: string;          // Acknowledgement No
  ackDt: string;          // Acknowledgement Date (ISO)
  signedInvoice?: string; // PINT/encrypted signed invoice (base64)
  signedQr?: string;      // Signed QR code (data URL / base64)
  status: 'GENERATED' | 'CANCELLED';
}

export interface EwbResult {
  ewbNo: string;
  ewbDate: string;
  validUntil: string;
  status: 'GENERATED' | 'CANCELLED';
}

export interface InwardSupply {
  irn: string;
  supplierGstin: string;
  supplierName: string;
  docNo: string;
  docDate: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

export type ImsActionCode = 'ACC' | 'REJ' | 'PEN';

export interface GspConnector {
  generateIrn(payload: any, company: { gstin: string }): Promise<EinvoiceResult>;
  cancelIrn(irn: string, reason: string, rsnCode?: string): Promise<{ cancelled: boolean; irn: string }>;
  generateEwb(payload: any, company: { gstin: string }): Promise<EwbResult>;
  getInwardSupplies(period: string): Promise<InwardSupply[]>;
  pushImsAction(irn: string, action: ImsActionCode, reason?: string): Promise<{ ok: boolean; irn: string }>;
}
