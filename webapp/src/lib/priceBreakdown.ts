import type { PriceBreakdown } from "@/lib/laundry";

export type SummaryRow = {
  key: string;
  label: string;
  /** Rupees, always positive — `kind` says whether it is added or taken off. */
  amount: number;
  kind: "subtotal" | "charge" | "discount" | "tax";
};

const percentText = (percent: number) => String(Number(percent.toFixed(2)));

/**
 * The lines of an order's price summary, in calculation order:
 *   Subtotal → Additional Charge(s) → Discount(s) → GST → (Grand total is shown by the caller)
 * Zero lines are left out. Labels and amounts come from the backend's breakdown (the one calculation
 * used to book the order); an order booked before that was stored gets plain labels from its totals.
 * There is deliberately no generic "Adjustment" row — every rupee is one of the named lines.
 */
export function summaryRows(input: {
  subtotal: number;
  charges: number;
  discounts: number;
  taxAmount: number;
  taxRate?: number;
  breakdown?: PriceBreakdown;
}): SummaryRow[] {
  const breakdown: PriceBreakdown = input.breakdown || {
    charges: input.charges > 0 ? [{ label: "Additional Charge", percent: null, amount: input.charges }] : [],
    discounts: input.discounts > 0 ? [{ label: "Discount", percent: null, amount: input.discounts }] : [],
    tax: input.taxAmount > 0 ? { label: "GST", percent: input.taxRate || null, amount: input.taxAmount } : null,
  };
  const rows: SummaryRow[] = [{ key: "subtotal", label: "Subtotal", amount: input.subtotal, kind: "subtotal" }];
  breakdown.charges.forEach((line, index) => rows.push({ key: `charge-${index}`, label: line.label, amount: line.amount, kind: "charge" }));
  breakdown.discounts.forEach((line, index) => rows.push({ key: `discount-${index}`, label: line.label, amount: line.amount, kind: "discount" }));
  if (breakdown.tax && breakdown.tax.amount > 0) {
    const percent = breakdown.tax.percent ?? input.taxRate ?? null;
    rows.push({ key: "tax", label: percent ? `${breakdown.tax.label || "GST"} (${percentText(percent)}%)` : breakdown.tax.label || "GST", amount: breakdown.tax.amount, kind: "tax" });
  }
  return rows;
}
