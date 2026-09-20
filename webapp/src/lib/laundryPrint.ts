import { lndryBrand } from "@/assets/generated/manifest";
import { formatINR } from "@/lib/utils";
import { buildTagsHtml, deliverDocument, type DocumentOutcome } from "@/lib/tagOutput";

export type PrintTag = {
  unitId?: string;
  containerId?: string;
  tagKind?: "garment" | "container";
  tagNumber: string;
  tagPayload?: string;
  orderNumber: string;
  customer: string;
  customerPhone?: string;
  invoiceNumber?: string;
  garment: string;
  service: string;
  /** Category / sub-category, when the order recorded one (older orders only have the service). */
  category?: string;
  sequence: number;
  lineSequence?: number;
  total: number;
  orderDate: string;
  expectedDeliveryDate: string;
  notes?: string;
  express?: boolean;
  specialCare?: boolean;
  state?: string;
};

export type PrintOrder = {
  id: string;
  orderNumber: string;
  invoiceNumber?: string;
  customer: { name: string; phone?: string };
  fulfillmentMode?: string;
  expectedDeliveryDate: string;
  receipt: {
    items: Array<{
      garmentName: string;
      serviceName: string;
      qty: number;
      amount: number;
    }>;
    subtotal: number;
    charges: number;
    discounts: number;
    taxAmount: number;
    grandTotal: number;
    paymentMode?: string;
    paymentStatus?: string;
  };
};

export type PrintSettings = {
  businessName?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoDataUrl?: string;
  taxMode?: 'none' | 'gst';
  gstin?: string;
  printerProfile?: string;
  afterBooking?: "ask" | "open-print-centre" | "auto-print" | "none";
  tagTemplate?: {
    preset?: string;
    /** Printer resolution the barcode is sized for: 203 (typical thermal), 300 or 600 dpi. */
    printDpi?: number;
    widthMm?: number;
    heightMm?: number;
    columns?: number;
    rows?: number;
    orientation?: "portrait" | "landscape";
    pageSize?: "A4" | "thermal";
    marginMm?: number;
    fontScale?: number;
    lineSpacing?: number;
    /** Tags always print a Code 128 barcode; older saved templates may still say "qr" and are treated the same. */
    codeFormat?: string;
    showLogo?: boolean;
    showGarment?: boolean;
    showService?: boolean;
    showInvoiceNumber?: boolean;
    showPhone?: boolean;
    showOrderDate?: boolean;
    showTagCode?: boolean;
    showStoreName?: boolean;
    showCustomer?: boolean;
    showOrder?: boolean;
    showDueDate?: boolean;
    showSequence?: boolean;
    showNotes?: boolean;
    showExpress?: boolean;
    showSpecialCare?: boolean;
  };
};
export type PrintCorrection = {
  id: string;
  orderId: string;
  garmentUnitId: string;
  decision: string;
  customerMessage: string;
  issuedAt: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] || char,
  );

async function imageDataUrl(source: string) {
  if (source.startsWith("data:image/")) return source;
  try {
    const response = await fetch(source);
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

export async function buildLaundryPrintHtml(
  kind: "receipt" | "tags",
  order: PrintOrder,
  settings?: PrintSettings,
  requestedTags?: PrintTag[],
) {
  const businessName = settings?.businessName?.trim() || "Epic Laundry";
  const logo = await imageDataUrl(
    settings?.logoDataUrl?.startsWith("data:image/")
      ? settings.logoDataUrl
      : lndryBrand.mark,
  );
  const logoMarkup = settings?.tagTemplate?.showLogo === false ? "" : logo
    ? `<img src="${logo}" alt="${escapeHtml(businessName)}" class="brand-mark">`
    : `<span class="brand-fallback">EL</span>`;
  const contact = [settings?.address, settings?.phone, settings?.email]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  const header = `<header>${logoMarkup}<div>${settings?.tagTemplate?.showStoreName !== false ? `<strong>${escapeHtml(businessName)}</strong>` : ""}<small>Local laundry operating desk</small>${contact ? `<small>${contact}</small>` : ""}</div></header>`;
  if (kind === "receipt") {
    const body = `${header}<div class="eyebrow">Customer receipt</div><h1>${escapeHtml(order.invoiceNumber || order.orderNumber)}</h1><p class="muted">${escapeHtml(order.customer.name)}${order.customer.phone ? ` · ${escapeHtml(order.customer.phone)}` : ""} · Due ${escapeHtml(order.expectedDeliveryDate)}</p><div class="line-items">${order.receipt.items.map((item) => `<div><span>${escapeHtml(item.garmentName)} <small>${escapeHtml(item.serviceName)} · ${item.qty}</small></span><strong>${formatINR(item.amount)}</strong></div>`).join("")}</div><div class="totals"><div><span>Subtotal</span><span>${formatINR(order.receipt.subtotal)}</span></div><div><span>Adjustments</span><span>${formatINR(order.receipt.charges - order.receipt.discounts + order.receipt.taxAmount)}</span></div><div class="grand"><span>Total</span><strong>${formatINR(order.receipt.grandTotal)}</strong></div></div><p class="muted">${escapeHtml(order.receipt.paymentStatus || "")} · ${escapeHtml(order.receipt.paymentMode || "")}</p>`;
    return documentHtml("Customer receipt", body, "receipt-page");
  }
  const tags = requestedTags || [];
  const containerOnly =
    tags.length > 0 && tags.every((tag) => tag.tagKind === "container");
  return buildTagsHtml(
    tags,
    settings,
    logo || undefined,
    `${containerOnly ? "Container tags" : "Garment tags"} · ${order.orderNumber}`,
  );
}

/**
 * Builds the document and sends it to paper or a PDF file — the one entry point every print button
 * uses, so the Print Centre, after-booking print and single-tag reprint all behave the same.
 * Tags are printed / saved in the order given (a batch runs first tag to last with no re-selection).
 */
export async function deliverPrintDocument(
  kind: "receipt" | "tags",
  order: PrintOrder,
  settings: PrintSettings | undefined,
  tags: PrintTag[],
  options: { pdf?: boolean; filename: string },
): Promise<DocumentOutcome> {
  const html = await buildLaundryPrintHtml(kind, order, settings, tags);
  const logo = await imageDataUrl(
    settings?.logoDataUrl?.startsWith("data:image/") ? settings.logoDataUrl : lndryBrand.mark,
  );
  return deliverDocument({
    html,
    pdf: Boolean(options.pdf),
    filename: options.filename,
    tags: kind === "tags" ? tags : undefined,
    settings,
    logoDataUrl: logo || undefined,
  });
}

export async function buildLaundryCorrectionPrintHtml(
  correction: PrintCorrection,
  settings?: PrintSettings,
) {
  const businessName = settings?.businessName?.trim() || "Epic Laundry";
  const logo = await imageDataUrl(
    settings?.logoDataUrl?.startsWith("data:image/")
      ? settings.logoDataUrl
      : lndryBrand.mark,
  );
  const logoMarkup = logo
    ? `<img src="${logo}" alt="${escapeHtml(businessName)}" class="brand-mark">`
    : `<span class="brand-fallback">EL</span>`;
  const body = `<header>${logoMarkup}<div><strong>${escapeHtml(businessName)}</strong><small>Customer quality correction</small></div></header><div class="eyebrow">Customer care document</div><h1>${escapeHtml(correction.decision)} resolution</h1><div class="line-items"><div><span>Document</span><strong>${escapeHtml(correction.id)}</strong></div><div><span>Order</span><strong>${escapeHtml(correction.orderId)}</strong></div><div><span>Garment unit</span><strong>${escapeHtml(correction.garmentUnitId)}</strong></div><div><span>Issued</span><strong>${escapeHtml(new Date(correction.issuedAt).toLocaleString("en-IN"))}</strong></div></div><blockquote>${escapeHtml(correction.customerMessage)}</blockquote><p class="muted">This printed copy is a customer-safe communication. The original quality claim remains immutable in the Epic Laundry audit trail.</p>`;
  return documentHtml("Customer correction", body, "correction-page");
}

function documentHtml(
  title: string,
  body: string,
  pageClass: string,
  extraCss = "",
) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} · Epic Laundry</title><style>
    @page{size:A4;margin:8mm}*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;color:#17353c;margin:0;background:#fff}.${pageClass}{max-width:194mm;margin:0 auto;padding:2mm}.eyebrow{margin-top:8mm;color:#3a7d78;font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}h1{font-size:23px;line-height:1.1;margin:3mm 0 1.5mm}.muted{color:#718087;font-size:11px;margin:0}header{display:flex;align-items:center;gap:10px;border-bottom:1px solid #c7d7d0;padding-bottom:4mm}header strong{display:block;font-size:20px;letter-spacing:-.02em}header small{display:block;color:#718087;font-size:9px;margin-top:2px}.brand-mark,.brand-fallback{width:34px;height:34px;object-fit:contain}.brand-fallback{display:grid;place-items:center;border-radius:9px;background:#123039;color:#f2c66d;font-weight:900}.line-items{margin-top:9mm;border-top:1px solid #d8e2dd}.line-items>div,.totals>div{display:flex;justify-content:space-between;gap:12px;padding:3mm 0;border-bottom:1px solid #e8eeeb;font-size:12px}.line-items small{display:block;color:#718087;font-size:10px;margin-top:1px}.totals{margin-top:6mm}.totals .grand{border-top:1.5px solid #123039;border-bottom:0;font-size:16px;padding-top:4mm}blockquote{margin:10mm 0;padding:5mm;border-left:1.5mm solid #e6bc65;background:#f7faf7;line-height:1.6;font-size:14px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}${extraCss}
  </style></head><body><div class="${pageClass}">${body}</div></body></html>`;
}
