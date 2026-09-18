// GST computation engine (docs/05-india-compliance/01-gst.md).
// Determines intra- vs inter-state and splits tax into CGST+SGST or IGST per invoice line.
// Statutory math is deterministic (never LLM-computed) — blueprint §2.7.

export interface GstItemInput {
  hsn: string;
  taxable: number;   // qty * rate, exclusive of tax
  gstRate: number;   // percent
  qty?: number;
  unit?: string;
}

export interface GstLine {
  hsn: string;
  qty: number;
  unit: string;
  taxable: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface GstBreakdown {
  intraState: boolean;
  supplierState: string;
  posState: string;
  lines: GstLine[];
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
  grandTotal: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeGst(
  items: GstItemInput[],
  supplierState: string,
  posState: string,
): GstBreakdown {
  const intraState = supplierState === posState;
  let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;

  const lines: GstLine[] = items.map((it) => {
    const taxable = r2(it.taxable);
    const tax = r2(taxable * (it.gstRate || 0) / 100);
    let cgst = 0, sgst = 0, igst = 0;
    if (intraState) {
      cgst = r2(tax / 2);
      sgst = r2(tax - cgst); // avoid 0.01 drift
    } else {
      igst = tax;
    }
    totalTaxable += taxable; totalCgst += cgst; totalSgst += sgst; totalIgst += igst;
    return {
      hsn: it.hsn, qty: it.qty ?? 1, unit: it.unit ?? 'NOS',
      taxable, gstRate: it.gstRate, cgst, sgst, igst,
      total: r2(taxable + tax),
    };
  });

  totalTaxable = r2(totalTaxable); totalCgst = r2(totalCgst);
  totalSgst = r2(totalSgst); totalIgst = r2(totalIgst);
  const totalTax = r2(totalCgst + totalSgst + totalIgst);
  return {
    intraState, supplierState, posState, lines,
    totalTaxable, totalCgst, totalSgst, totalIgst, totalTax,
    grandTotal: r2(totalTaxable + totalTax),
  };
}
