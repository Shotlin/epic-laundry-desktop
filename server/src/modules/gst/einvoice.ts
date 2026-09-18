// GST e-invoice (IRN) payload builder — faithful to the e-Invoice Schema v1.1 shape.
// We DO NOT call the IRP here (no credentials); this produces the JSON a GSP/IRP call needs.
// See docs/05-india-compliance/01-gst.md §e-invoice.
import type { GstBreakdown } from './engine.js';

export interface CompanyInfo { gstin: string; name: string; addr: string; state: string; pincode?: string; }
export interface PartyInfo { gstin?: string; name: string; addr?: string; state?: string; pos?: string; }

export function buildEinvoicePayload(
  invoice: { name: string; posting_date: string; data: any },
  company: CompanyInfo,
  party: PartyInfo,
  gst: GstBreakdown,
) {
  const isB2b = !!party.gstin;
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: isB2b ? 'B2B' : 'B2C', RegRev: 'N', EcmGstin: null },
    DocDtls: { Typ: 'INV', No: invoice.name, Dt: invoice.posting_date },
    SellerDtls: { Gstin: company.gstin, LglNm: company.name, TrdNm: company.name, Addr1: company.addr, Stcd: company.state, Agnt: null },
    BuyerDtls: {
      Gstin: party.gstin || 'URP', LglNm: party.name,
      Pos: party.pos || invoice.data.place_of_supply, Stcd: party.state || invoice.data.place_of_supply,
     Addr1: party.addr || '',
    },
    ItemList: gst.lines.map((l, i) => ({
      SlNo: String(i + 1), HsnCd: l.hsn, PrdDesc: '', Qty: l.qty, Unit: l.unit,
      TotAmt: l.taxable, GstRt: l.gstRate,
      CgstAmt: l.cgst, SgstAmt: l.sgst, IgstAmt: l.igst, TotItemVal: l.total,
    })),
    ValDtls: {
      AssVal: gst.totalTaxable, CgstVal: gst.totalCgst, SgstVal: gst.totalSgst,
      IgstVal: gst.totalIgst, DisVal: 0, RndOffAmt: 0, TotInvVal: gst.grandTotal,
      TotInvValFc: gst.grandTotal,
    },
    // IRN / AckDtls filled by the IRP after posting to a GSP; we leave null pre-submission.
    IrpDtls: null,
  };
}
