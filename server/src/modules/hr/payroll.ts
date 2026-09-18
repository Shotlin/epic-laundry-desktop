// Payroll computation (India): earnings, statutory deductions (PF/ESI/TDS/PT), net pay.
// Kept framework-free so the posting engine, the REST API, and the UI can all reuse it.
export interface SalaryStructure {
  basic: number; hra?: number; da?: number; other_allowances?: number;
  pf_pct?: number; esi_pct?: number; tds_pct?: number; professional_tax?: number;
}
export interface PayrollResult {
  paid_days: number; total_days: number; proRate: number;
  earnings: { basic: number; hra: number; da: number; other_allowances: number };
  gross: number;
  deductions: { pf: number; esi: number; tds: number; pt: number };
  net_pay: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Simplified old-regime slab on annualized taxable income (for demonstration; real TDS needs
// declarations + Section 80C etc.). std deduction ₹50k; 5%/20%/30% over 2.5L/5L/10L.
export function annualTax(taxableAnnual: number): number {
  const t = Math.max(0, taxableAnnual - 50000);
  let tax = 0;
  if (t > 1000000) { tax += (t - 1000000) * 0.3; tax += 250000 * 0.2; tax += 250000 * 0.05; }
  else if (t > 500000) { tax += (t - 500000) * 0.2; tax += 250000 * 0.05; }
  else if (t > 250000) { tax += (t - 250000) * 0.05; }
  return tax;
}

export function computePayroll(ss: Record<string, any>, paidDays: number, totalDays = 30): PayrollResult {
  const pd = Math.max(0, Number(paidDays) || 0);
  const td = Math.max(1, Number(totalDays) || 30);
  const proRate = pd / td;

  const basic = round2((Number(ss.basic) || 0) * proRate);
  const hra = round2((Number(ss.hra) || 0) * proRate);
  const da = round2((Number(ss.da) || 0) * proRate);
  const other = round2((Number(ss.other_allowances) || 0) * proRate);
  const gross = round2(basic + hra + da + other);

  const pf = round2(basic * (Number(ss.pf_pct) || 0) / 100);
  const esi = round2(gross * (Number(ss.esi_pct) || 0) / 100);
  const pt = round2(Number(ss.professional_tax) || 0);

  let tds: number;
  if (Number(ss.tds_pct) > 0) {
    tds = round2(gross * (Number(ss.tds_pct) || 0) / 100);
  } else {
    const taxableAnnual = (gross - pf - esi - pt) * 12;
    tds = round2(annualTax(taxableAnnual) / 12);
  }

  const net = round2(gross - pf - esi - tds - pt);
  return {
    paid_days: pd, total_days: td, proRate: round2(proRate),
    earnings: { basic, hra, da, other_allowances: other },
    gross,
    deductions: { pf, esi, tds, pt },
    net_pay: net,
  };
}
