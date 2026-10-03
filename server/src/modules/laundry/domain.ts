import { audit } from '../../kernel/audit.js';
import { cancelRow, createRow, submitRow } from '../../kernel/entity-service.js';
import { publish } from '../../kernel/event-bus.js';
import { store } from '../../kernel/store.js';
import type { EntityRow } from '../../kernel/types.js';
import { appendCustomerLedger, searchCustomerRecords } from './customers.js';
import { notify } from '../crm/engagement.js';
import { laundryBusinessDate } from './dates.js';
import { randomUUID } from 'node:crypto';
import type { GarmentUnitRecord, LaundryContainerEventRecord, LaundryContainerRecord, LaundryContainerState, TagHistoryRecord, TagPrintJobRecord, TagPrintJobStatus } from '../../kernel/store.js';
import { parseMoney, moneyNumber, optionalMoney } from '../../kernel/money.js';
import { completeOpenTask, createProductionTask, productionStateCreatesTask } from './production.js';
import { cashShiftForTransaction } from './cash.js';
import { ensureCanonicalInvoiceForLegacy } from '../gst/legacy-invoice-bridge.js';
import { supplierStateCodeForTenant, supplierTaxProfile } from '../gst/tax-policy.js';
import { createLaundryCancellationCreditNote } from '../gst/cancellation-credit-note.js';
import { financeExpenseCategory } from '../finance/classification.js';
import { VISUAL_ASSETS } from './garment-assets.js';
import { listPackageBalanceRows } from './packages.js';

function canonicalTaxEvidenceConfigured(tenant: string) {
  // A supplier profile and approved rule are not enough to activate GST on a
  // counter order. The store-level tax mode is the explicit operator choice;
  // without it, a tax-free local invoice must remain a valid tax-free invoice
  // instead of being reconciled against the standard 18% policy.
  return Boolean(store.getStoreSettings(tenant).taxMode === 'gst' && supplierTaxProfile(tenant) && store.rowsOf(tenant, 'tax_policy_rule').some((row) => row.status === 'Approved' && row.data?.approvalStatus === 'Approved'));
}

export function inferredGarmentVisualKey(name: string, category: string) {
  const value = `${name} ${category}`.toLowerCase();
  if (/shoe|sneaker|slipper|footwear/.test(value)) return 'shoePair';
  if (/bag|handbag|purse|luggage/.test(value)) return 'handbag';
  if (/saree|dupatta|stole|scarf|muffler|turban/.test(value)) return value.includes('scarf') || value.includes('stole') ? 'tieScarf' : 'foldedSaree';
  if (/salwar/.test(value)) return 'salwarSuit';
  if (/lehenga/.test(value)) return 'lehenga';
  if (/sherwani/.test(value)) return 'sherwani';
  if (/blouse/.test(value)) return 'blouse';
  if (/kurti/.test(value)) return 'foldedKurti';
  if (/kurta|pyjama/.test(value)) return 'foldedKurta';
  if (/dress|gown|frock|nighty|skirt/.test(value)) return 'foldedDress';
  if (/blazer|suit|coat|jacket/.test(value)) return 'foldedBlazer';
  if (/jean|denim/.test(value)) return 'foldedJeans';
  if (/hoodie|sweater|sweatshirt/.test(value)) return 'foldedHoodie';
  if (/blanket|comforter/.test(value)) return 'foldedBlanket';
  if (/quilt|duvet/.test(value)) return 'quiltDuvet';
  if (/pillow/.test(value)) return 'pillowCover';
  if (/curtain/.test(value)) return 'curtain';
  if (/carpet|rug/.test(value)) return 'carpetRug';
  if (/towel/.test(value)) return 'towel';
  if (/sock/.test(value)) return 'socksPair';
  if (/bed ?sheet|bedsheet|bed ?cover|table ?cloth|napkin|cushion|cloth|mixed/.test(value)) return 'foldedBedsheet';
  if (/shirt|top|cap|uniform|dhoti|pant|trouser|lower|short|capri|underwear|inner|boxer|bra|petti|safari/.test(value)) return /jean|denim/.test(value) ? 'foldedJeans' : 'foldedShirt';
  if (/soft toy/.test(value)) return 'softToy';
  return 'mixedClothes';
}

function backfillLaundryGarmentVisuals(tenant: string) {
  let applied = 0;
  for (const row of store.rowsOf(tenant, 'laundry_garment')) {
    if (row.data.active === false || String(row.data.visual_key || '').trim()) continue;
    const visualKey = inferredGarmentVisualKey(String(row.data.name || ''), String(row.data.category || ''));
    const photo = VISUAL_ASSETS[visualKey];
    if (!photo) continue;
    row.data.visual_key = visualKey;
    row.data.photo = photo;
    row.updated_at = new Date().toISOString();
    store.updateRow(row);
    applied += 1;
  }
  if (applied) audit(tenant, 'system', 'laundry:garment-visuals-backfilled', { after: { applied, strategy: 'explicit-persisted-visual-key' } });
}

export const LAUNDRY_STATES = ['Booked', 'Picked Up', 'In Process', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'] as const;
export type LaundryState = typeof LAUNDRY_STATES[number];

type BookInput = {
  customer: { id?: string; name?: string; phone?: string; email?: string; address?: string };
  items: Array<{ garment: string; service: string; qty: number; color?: string; garmentType?: string; rateOverride?: number }>;
  orderDate?: string;
  expectedDeliveryDate: string;
  containerCount?: number;
  fulfillmentMode: 'Pickup Order' | 'Home Delivery' | 'Express Delivery';
  paymentMode?: 'Pay Later' | 'Cash' | 'UPI' | 'Card' | 'Bank';
  cashRegister?: string;
  paymentReference?: string;
  serviceZone?: string;
  charges?: number;
  discounts?: number;
  taxRate?: number;
  chargeRuleIds?: string[];
  discountRuleIds?: string[];
  taxRuleId?: string;
  notes?: string;
  photoPaths?: string;
  placeOfSupply?: string;
  /** A wallet redemption already CONFIRMED against the real LNDRY backend
   * before this order is booked (the OTP-confirm step already moved the
   * money) — this just records that fact on the order and folds it in as
   * a second payment leg. `paymentMode`'s existing meaning is untouched:
   * it covers whatever remains after the wallet amount. */
  walletRedemption?: { requestId: string; amountPaise: number };
};

type QuotedItem = {
  garment: string;
  garmentName: string;
  service: string;
  serviceName: string;
  unit: string;
  qty: number;
  rate: number;
  priceRule: string;
  amount: number;
  hsn: string;
  color?: string;
  garmentType?: string;
  rateOverride?: number;
};

type Quote = {
  items: QuotedItem[];
  subtotal: number;
  charges: number;
  discounts: number;
  taxable: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  breakdown: {
    charges: Array<{ label: string; percent: number | null; amount: number }>;
    discounts: Array<{ label: string; percent: number | null; amount: number }>;
    tax: { label: string; percent: number | null; amount: number } | null;
  };
};

type ExpenseInput = {
  expenseName: string;
  expenseDate: string;
  amount: number | string;
  financeCategory?: string;
  paymentReceiver?: string;
  invoiceNumber?: string;
  isTaxPaid?: boolean;
  paymentMode?: 'Cash' | 'UPI' | 'Card' | 'Bank';
  cashRegister?: string;
  notes?: string;
  attachment?: string;
};

type ImportCustomerInput = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
};

type ImportPriceInput = {
  garmentName?: string;
  categoryName?: string;
  serviceName?: string;
  rate?: number | string;
  unit?: string;
  hsn?: string;
  gstRate?: number | string;
  visualKey?: string;
  photo?: string;
  customerPhone?: string;
};

type ImportIssue = { row: number; message: string };
type ImportResult = { created: number; updated: number; skipped: number; errors: ImportIssue[]; job?: { id: string; status: string } };
export type LaundryCatalogueImportInput = {
  categories?: Array<CategoryInput & { id?: string }>;
  services?: Array<ServiceInput & { id?: string }>;
  garments?: Array<GarmentInput & { id?: string }>;
  prices?: Array<PriceInput & { id?: string }>;
  chargeRules?: Array<AdjustmentRuleInput & { id?: string }>;
  discountRules?: Array<AdjustmentRuleInput & { id?: string }>;
  taxRules?: Array<TaxRuleInput & { id?: string }>;
};
type RiderInput = { name: string; phone?: string };
type AssignmentInput = { stage: 'pickup' | 'delivery'; riderId?: string; slot?: string };
type RiderSettlementInput = { rider?: string; date?: string; amount?: number | string; method?: 'Cash' | 'UPI' | 'Bank'; status?: 'Pending' | 'Handed Over' | 'Reconciled' | 'Rejected'; orderIds?: string[]; reference?: string; notes?: string };
type FulfillmentInput = { itemIndex?: number; stage?: 'Picked Up' | 'In Process' | 'Ready' | 'Delivered'; quantity?: number; note?: string };
export const GARMENT_UNIT_STATES = ['Intake', 'Sorted', 'Processing', 'QC', 'Rewash', 'Assembly', 'Racked', 'Dispatched', 'Delivered', 'Missing', 'Damaged', 'Cancelled'] as const;
export type GarmentUnitState = typeof GARMENT_UNIT_STATES[number];
type GarmentScanInput = { tagCode?: string; nextState?: GarmentUnitState; location?: string; note?: string; condition?: string };
type ContainerScanInput = { tagCode?: string; nextState?: LaundryContainerState; location?: string; note?: string; condition?: string };
type EditOrderInput = Pick<BookInput, 'items' | 'expectedDeliveryDate' | 'fulfillmentMode' | 'charges' | 'discounts' | 'taxRate' | 'chargeRuleIds' | 'discountRuleIds' | 'taxRuleId' | 'serviceZone'> & { notes?: string; deliveryAddress?: string; expectedVersion?: number };
type CategoryInput = { name?: string; color?: string; image?: string; sortOrder?: number; active?: boolean };
type ServiceInput = { name?: string; description?: string; units?: string[]; active?: boolean };
type GarmentInput = { name?: string; code?: string; category?: string; unit?: string; hsn?: string; gstRate?: number; visualKey?: string; photo?: string; active?: boolean };
type PriceInput = { garment?: string; service?: string; customer?: string; rate?: number; active?: boolean };
type AdjustmentRuleInput = { name?: string; type?: 'Flat' | 'Percentage'; amount?: number; expressCharge?: boolean; description?: string; active?: boolean };
type TaxRuleInput = { name?: string; rate?: number; active?: boolean };

const SERVICE_UNIT_DEFINITIONS = [
  { value: 'Piece', fullName: 'Quantity', shortName: 'Qty' },
  { value: 'Kilogram', fullName: 'Kilogram', shortName: 'Kg' },
  { value: 'Square Foot', fullName: 'Sq.Ft', shortName: 'Sq.Ft' },
  { value: 'Pair', fullName: 'Pair', shortName: 'Pair' },
] as const;
const SERVICE_UNITS = SERVICE_UNIT_DEFINITIONS.map((unit) => unit.value);
const GARMENT_VISUAL_KEYS = ['foldedShirt', 'foldedTrouser', 'foldedSaree', 'foldedKurti', 'foldedBlanket', 'foldedBedsheet', 'mixedClothes', 'shoePair', 'foldedBlazer', 'foldedDress', 'foldedJeans', 'foldedHoodie', 'foldedKurta', 'sherwani', 'blouse', 'salwarSuit', 'lehenga', 'tieScarf', 'pillowCover', 'quiltDuvet', 'handbag', 'towel', 'curtain', 'carpetRug', 'softToy', 'socksPair'] as const;
const CONTAINER_TRANSITIONS: Record<LaundryContainerState, LaundryContainerState[]> = {
  Intake: ['Processing', 'Cancelled'], Processing: ['Ready', 'Cancelled'], Ready: ['Dispatched', 'Delivered', 'Cancelled'], Dispatched: ['Delivered'],
  Delivered: [], Missing: [], Damaged: [], Cancelled: [],
};
const MAX_MASTER_IMAGE_PATH = 512;

export class TagRetiredError extends Error {
  readonly code = 'TAG_RETIRED';
  constructor(readonly details: { tagCode: string; garmentUnitId: string; currentTagCode: string; replacementDate?: string; replacementOperator?: string }) {
    super('This tag has been replaced. Scan the current active tag to continue.');
    this.name = 'TagRetiredError';
  }
}

export class LaundryDomainError extends Error {
  constructor(readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'LaundryDomainError';
  }
}

const laundryError = (code: string, message: string, details?: Record<string, unknown>) => new LaundryDomainError(code, message, details);

const TRANSITIONS: Record<LaundryState, LaundryState[]> = {
  Booked: ['Picked Up', 'In Process', 'Cancelled'],
  'Picked Up': ['In Process', 'Cancelled'],
  'In Process': ['Ready', 'Cancelled'],
  Ready: ['Out for Delivery', 'Delivered', 'Cancelled'],
  'Out for Delivery': ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

const GARMENT_TRANSITIONS: Record<GarmentUnitState, GarmentUnitState[]> = {
  Intake: ['Sorted', 'Processing', 'Cancelled', 'Missing', 'Damaged'],
  Sorted: ['Processing', 'Cancelled', 'Missing', 'Damaged'],
  Processing: ['QC', 'Rewash', 'Cancelled', 'Missing', 'Damaged'],
  QC: ['Assembly', 'Rewash', 'Cancelled', 'Missing', 'Damaged'],
  Rewash: ['Processing', 'QC', 'Cancelled', 'Missing', 'Damaged'],
  Assembly: ['Racked', 'Cancelled', 'Missing', 'Damaged'],
  Racked: ['Dispatched', 'Cancelled', 'Missing', 'Damaged'],
  Dispatched: ['Delivered', 'Missing', 'Damaged'],
  Delivered: [], Missing: [], Damaged: [], Cancelled: [],
};

function validateRackLocation(tenant: string, unitId: string, state: string, location: string) {
  if (state !== 'Racked') return;
  const rack = String(location || '').trim();
  if (!rack) throw new Error('a rack or bin location is required before marking a garment Racked');
  const collision = store.listGarmentUnits(tenant, { state: 'Racked' }).find((candidate) => candidate.id !== unitId && candidate.location.toLowerCase() === rack.toLowerCase());
  if (collision) throw new Error(`rack location ${rack} is already occupied by another garment`);
}

const round = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const today = () => laundryBusinessDate();
const normPhone = (value?: string) => String(value || '').replace(/\D/g, '');

function activeRows(tenant: string, entity: string) {
  return store.rowsOf(tenant, entity).filter((row) => row.data.active !== false);
}

function getRequired(tenant: string, entity: string, id: string, label: string) {
  const row = store.getRow(tenant, id);
  if (!row || row.entity !== entity) throw new Error(`${label} not found`);
  if (row.data.active === false) throw new Error(`${label} is inactive`);
  return row;
}

function resolveCustomer(tenant: string, actor: string, input: BookInput['customer']) {
  if (input.id) {
    const customer = store.getRow(tenant, input.id);
    if (!customer || customer.entity !== 'party' || !customer.data.is_customer) throw new Error('customer not found');
    return customer;
  }
  const phone = normPhone(input.phone);
  if (!input.name?.trim()) throw new Error('customer name is required');
  if (phone.length < 6) throw new Error('a valid customer phone is required');
  const existing = store.rowsOf(tenant, 'party').find((row) => normPhone(row.data.phone) === phone && row.data.is_customer);
  if (existing) return existing;
  return createRow(tenant, actor, 'party', {
    name: input.name.trim(), phone, email: input.email?.trim(), address: input.address?.trim(), is_customer: true,
  });
}

function priceFor(tenant: string, garment: string, service: string, customer: string) {
  const prices = activeRows(tenant, 'laundry_price')
    .filter((row) => row.data.garment === garment && row.data.service === service)
    .sort((a, b) => Number(Boolean(b.data.customer)) - Number(Boolean(a.data.customer)));
  const rule = prices.find((row) => row.data.customer === customer) || prices.find((row) => !row.data.customer);
  if (!rule) throw new Error('no active price rule exists for this garment and service');
  const rate = round(Number(rule.data.rate));
  if (rate < 0) throw new Error('price rule has an invalid rate');
  return { rate, rule };
}

function selectedRules(tenant: string, entity: string, ids: unknown) {
  const requested = Array.isArray(ids) ? ids.map(String) : [];
  if (requested.length !== new Set(requested).size) throw new Error('each configuration rule can only be selected once');
  return requested.map((id) => getRequired(tenant, entity, id, 'configuration rule'));
}

function amountForRule(rule: EntityRow, base: number) {
  const amount = round(Number(rule.data.amount));
  if (!Number.isFinite(amount) || amount < 0) throw new Error('configuration rule has an invalid amount');
  return rule.data.type === 'Percentage' ? round(base * amount / 100) : amount;
}

export function quoteLaundryOrder(tenant: string, input: Pick<BookInput, 'items' | 'charges' | 'discounts' | 'taxRate' | 'chargeRuleIds' | 'discountRuleIds' | 'taxRuleId'>, customer = ''): Quote {
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error('select at least one garment');
  const seen = new Set<string>();
  const items = input.items.map((line) => {
    const qty = Number(line.qty);
    if (!line.garment || !line.service || !Number.isFinite(qty) || qty <= 0) throw new Error('each garment line needs a service and positive quantity');
    const key = `${line.garment}:${line.service}`;
    if (seen.has(key)) throw new Error('duplicate garment and service lines must be combined');
    seen.add(key);
    const garment = getRequired(tenant, 'laundry_garment', line.garment, 'garment');
    const service = getRequired(tenant, 'laundry_service', line.service, 'service');
    const price = priceFor(tenant, garment.id, service.id, customer);
    const unit = String(garment.data.unit || 'Piece');
    if (['Piece', 'Pair'].includes(unit) && !Number.isInteger(qty)) throw new Error(`${unit} quantities must be whole numbers`);
    const rateOverride = line.rateOverride === undefined || line.rateOverride === null ? undefined : Number(line.rateOverride);
    if (rateOverride !== undefined && (!Number.isFinite(rateOverride) || rateOverride < 0 || rateOverride > 1_000_000)) throw new Error('garment price override must be between ₹0 and ₹10,00,000');
    const color = String(line.color || '').trim().slice(0, 40);
    const garmentType = String(line.garmentType || '').trim().slice(0, 60);
    return {
      garment: garment.id,
      garmentName: String(garment.data.name),
      service: service.id,
      serviceName: String(service.data.name),
      unit,
      qty: round(qty),
      rate: rateOverride === undefined ? price.rate : round(rateOverride),
      priceRule: price.rule.id,
      amount: round(qty * (rateOverride === undefined ? price.rate : round(rateOverride))),
      hsn: String(garment.data.hsn || '9997'),
      ...(color ? { color } : {}),
      ...(garmentType ? { garmentType } : {}),
      ...(rateOverride === undefined ? {} : { rateOverride: round(rateOverride) }),
    };
  });
  const subtotal = round(items.reduce((sum, item) => sum + item.amount, 0));
  const chargeRuleLines = selectedRules(tenant, 'laundry_charge_rule', input.chargeRuleIds).map((rule) => ({
    label: String(rule.data.name || 'Charge'),
    percent: rule.data.type === 'Percentage' ? Number(rule.data.amount) : null,
    amount: amountForRule(rule, subtotal),
  }));
  const configuredCharges = chargeRuleLines.reduce((sum, line) => round(sum + line.amount), 0);
  const manualCharge = optionalMoney(input.charges, 'charges');
  const charges = Math.max(0, round(configuredCharges + manualCharge));
  const discountRuleLines = selectedRules(tenant, 'laundry_discount_rule', input.discountRuleIds).map((rule) => ({
    label: String(rule.data.name || 'Discount'),
    percent: rule.data.type === 'Percentage' ? Number(rule.data.amount) : null,
    amount: amountForRule(rule, subtotal + charges),
  }));
  const configuredDiscounts = discountRuleLines.reduce((sum, line) => round(sum + line.amount), 0);
  const manualDiscount = optionalMoney(input.discounts, 'discounts');
  const discountBeforeCap = round(configuredDiscounts + manualDiscount);
  const discounts = Math.min(discountBeforeCap, subtotal + charges);
  let remainingDiscount = discounts;
  const discountLines = [...discountRuleLines, ...(manualDiscount > 0 ? [{ label: 'Discount', percent: null, amount: manualDiscount }] : [])]
    .map((line) => {
      const amount = round(Math.min(line.amount, remainingDiscount));
      remainingDiscount = round(remainingDiscount - amount);
      return { ...line, amount };
    })
    .filter((line) => line.amount > 0);
  const taxable = round(subtotal + charges - discounts);
  const selectedTax = input.taxRuleId ? getRequired(tenant, 'laundry_tax_rule', String(input.taxRuleId), 'tax rule') : undefined;
  const taxRate = Math.max(0, Math.min(100, round(selectedTax ? Number(selectedTax.data.rate) : Number(input.taxRate) || 0)));
  const taxAmount = round(taxable * taxRate / 100);
  const breakdown = {
    charges: [...chargeRuleLines.filter((line) => line.amount > 0), ...(manualCharge > 0 ? [{ label: 'Additional Charge', percent: null, amount: manualCharge }] : [])],
    discounts: discountLines,
    tax: taxAmount > 0 ? { label: 'GST', percent: taxRate || null, amount: taxAmount } : null,
  };
  return { items, subtotal, charges, discounts, taxable, taxRate, taxAmount, grandTotal: round(taxable + taxAmount), breakdown };
}

function invoiceItems(quote: Quote) {
  const rows = quote.items.map((item) => ({
    item: item.garment, qty: item.qty, rate: item.rate, gst_rate: quote.taxRate, hsn: item.hsn, unit: item.unit,
    description: [item.garmentName, item.garmentType, item.color, item.serviceName].filter(Boolean).join(' · '),
  }));
  const adjustment = round(quote.charges - quote.discounts);
  if (adjustment !== 0) {
    rows.push({ item: 'LAUNDRY-ADJUSTMENT', qty: 1, rate: adjustment, gst_rate: quote.taxRate, hsn: '9997', unit: 'Piece', description: 'Laundry order adjustment' });
  }
  return rows;
}

function createPhysicalUnits(tenant: string, actor: string, orderId: string, customerId: string, items: QuotedItem[]) {
  const createdUnits: GarmentUnitRecord[] = [];
  const physicalItems = items.filter((item) => ['Piece', 'Pair'].includes(item.unit));
  const orderTotal = physicalItems.reduce((sum, item) => sum + Math.trunc(Number(item.qty)), 0);
  let orderSequence = 0;
  items.forEach((item, itemIndex) => {
    if (!['Piece', 'Pair'].includes(item.unit)) return;
    for (let lineSequence = 1; lineSequence <= Number(item.qty); lineSequence += 1) {
      const now = new Date().toISOString();
      const id = `gu_${randomUUID()}`;
      orderSequence += 1;
      const code = `GU-${today().replace(/-/g, '')}-${String(store.nextSeq('garment-unit')).padStart(6, '0')}`;
      const tagCode = `ELT-${today().replace(/-/g, '')}-${String(store.nextSeq('garment-tag')).padStart(6, '0')}`;
      const unit: GarmentUnitRecord = {
        id, tenant, storeId: store.currentStore(tenant), code, orderId, itemIndex, sequence: lineSequence,
        customerId, garmentId: item.garment, serviceId: item.service, unit: item.unit,
        state: 'Intake', location: 'Intake', activeTagCode: tagCode, condition: 'Normal', createdBy: actor, createdAt: now, updatedAt: now,
      };
      store.createGarmentUnit(unit);
      const tag: TagHistoryRecord = { id: `th_${randomUUID()}`, tenant, storeId: unit.storeId, garmentUnitId: id, tagCode, status: 'Active', issuedAt: now, issuedBy: actor, version: 1, createdAt: now };
      store.createTagHistory(tag);
      store.appendGarmentUnitEvent({ id: `gue_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: id, event: 'created', toState: 'Intake', location: 'Intake', actor, note: 'Created at order intake', metadata: { orderId, itemIndex, lineSequence, orderSequence, orderTotal, tagCode, color: item.color || '', garmentType: item.garmentType || '' }, createdAt: now });
      createProductionTask(tenant, actor, id, orderId, 'Intake');
      createdUnits.push(unit);
    }
  });
  return createdUnits;
}

function createLaundryContainers(tenant: string, actor: string, orderId: string, customerId: string, items: QuotedItem[], requestedCount: unknown) {
  if (requestedCount === undefined || requestedCount === null || requestedCount === '') return [];
  const count = Number(requestedCount);
  if (!Number.isSafeInteger(count) || count < 0 || count > 500) throw new Error('bag/container count must be an integer between 0 and 500');
  const hasContainerEligibleItem = items.some((item) => !['Piece', 'Pair'].includes(item.unit));
  if (count > 0 && !hasContainerEligibleItem) throw new Error('bag/container tags are only valid for weight or area-based order lines');
  const weightKg = items.filter((item) => item.unit === 'Kilogram').reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalWeight = weightKg > 0 ? round(weightKg) : undefined;
  const created: LaundryContainerRecord[] = [];
  for (let sequence = 1; sequence <= count; sequence += 1) {
    const now = new Date().toISOString();
    const id = `lc_${randomUUID()}`;
    const tagCode = `ELB-${today().replace(/-/g, '')}-${String(store.nextSeq('laundry-container-tag')).padStart(6, '0')}`;
    // The booked kilogram quantity belongs to the order. Until staff record
    // measured bag weights, do not repeat the same order total as each bag's
    // individual weight.
    const container: LaundryContainerRecord = { id, tenant, storeId: store.currentStore(tenant), orderId, customerId, sequence, total: count, weightKg: count === 1 ? totalWeight : undefined, tagCode, state: 'Intake', location: 'Intake', condition: 'Normal', createdBy: actor, createdAt: now, updatedAt: now };
    store.createLaundryContainer(container);
    store.appendLaundryContainerEvent({ id: `lce_${randomUUID()}`, tenant, storeId: container.storeId, containerId: id, event: 'created', toState: 'Intake', location: 'Intake', actor, note: 'Created from explicit bag/container count at order intake', createdAt: now });
    audit(tenant, actor, 'laundry:container-created', { entity: 'laundry_container', row_id: id, after: { orderId, tagCode, sequence, total: count, weightKg: container.weightKg, orderWeightKg: totalWeight } });
    created.push(container);
  }
  return created;
}

type GarmentBackfillCandidate = { orderId: string; orderNumber: string; customerId: string; itemIndex: number; sequence: number; garmentId: string; serviceId: string; unit: 'Piece' | 'Pair'; state: GarmentUnitState };
type GarmentBackfillIssue = { orderId: string; itemIndex?: number; message: string };

function historicalUnitState(value: unknown): GarmentUnitState {
  switch (String(value || 'Booked')) {
    case 'Picked Up': return 'Sorted';
    case 'In Process': return 'Processing';
    case 'Ready': return 'Racked';
    case 'Out for Delivery': return 'Dispatched';
    case 'Delivered': return 'Delivered';
    case 'Cancelled': return 'Cancelled';
    default: return 'Intake';
  }
}

/**
 * Preview legacy piece/pair order lines that do not yet have durable units.
 * Weight/area lines are intentionally excluded because they are not individual
 * physical garments. No rows are written by this function.
 */
export function previewLaundryGarmentBackfill(tenant: string) {
  const catalogue = laundryCatalogue(tenant);
  const garmentById = new Map(catalogue.garments.map((garment) => [garment.id, garment]));
  const orders = store.rowsOf(tenant, 'laundry_order').filter((row) => row.entity === 'laundry_order');
  const candidates: GarmentBackfillCandidate[] = [];
  const issues: GarmentBackfillIssue[] = [];
  let skippedNonPhysical = 0;
  for (const order of orders) {
    const items = Array.isArray(order.data.items) ? order.data.items as Array<Record<string, unknown>> : [];
    const existing = new Set(store.listGarmentUnits(tenant, { orderId: order.id }).map((unit) => `${unit.itemIndex}:${unit.sequence}`));
    const customerId = String(order.data.customer || '').trim();
    if (!customerId) { issues.push({ orderId: order.id, message: 'order has no customer link' }); continue; }
    for (const [itemIndex, item] of items.entries()) {
      const garmentId = String(item.garment || '').trim();
      const serviceId = String(item.service || '').trim();
      const garment = garmentById.get(garmentId);
      const unit = String(item.unit || garment?.unit || '');
      if (!['Piece', 'Pair'].includes(unit)) { skippedNonPhysical += 1; continue; }
      const qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty <= 0 || qty > 1000) { issues.push({ orderId: order.id, itemIndex, message: 'piece/pair quantity is not a positive integer' }); continue; }
      if (!garment) { issues.push({ orderId: order.id, itemIndex, message: 'garment is no longer present in the active branch catalogue' }); continue; }
      if (!serviceId || !catalogue.services.some((service) => service.id === serviceId)) { issues.push({ orderId: order.id, itemIndex, message: 'service is no longer present in the active branch catalogue' }); continue; }
      for (let sequence = 1; sequence <= qty; sequence += 1) {
        if (existing.has(`${itemIndex}:${sequence}`)) continue;
        candidates.push({ orderId: order.id, orderNumber: String(order.data.name || order.id), customerId, itemIndex, sequence, garmentId, serviceId, unit: unit as 'Piece' | 'Pair', state: historicalUnitState(order.data.state) });
        if (candidates.length >= 5000) break;
      }
      if (candidates.length >= 5000) break;
    }
    if (candidates.length >= 5000) break;
  }
  return { candidateCount: candidates.length, skippedNonPhysical, issueCount: issues.length, candidates: candidates.slice(0, 100), issues: issues.slice(0, 100), capped: candidates.length >= 5000 };
}

/** Apply a reviewed historical garment-unit backfill atomically and idempotently. */
export function applyLaundryGarmentBackfill(tenant: string, actor: string) {
  return store.transaction(() => {
    const preview = previewLaundryGarmentBackfill(tenant);
    if (preview.issueCount) throw new Error(`garment backfill is blocked by ${preview.issueCount} validation issue${preview.issueCount === 1 ? '' : 's'}`);
    const catalogue = laundryCatalogue(tenant);
    const garmentById = new Map(catalogue.garments.map((garment) => [garment.id, garment]));
    const applied: Array<{ id: string; orderId: string; tagCode: string }> = [];
    for (const order of store.rowsOf(tenant, 'laundry_order').filter((row) => row.entity === 'laundry_order')) {
      const items = Array.isArray(order.data.items) ? order.data.items as Array<Record<string, unknown>> : [];
      const existing = new Set(store.listGarmentUnits(tenant, { orderId: order.id }).map((unit) => `${unit.itemIndex}:${unit.sequence}`));
      const customerId = String(order.data.customer || '').trim();
      for (const [itemIndex, item] of items.entries()) {
        const garmentId = String(item.garment || '').trim();
        const garment = garmentById.get(garmentId);
        const unit = String(item.unit || garment?.unit || '');
        if (!['Piece', 'Pair'].includes(unit)) continue;
        const qty = Number(item.qty);
        for (let sequence = 1; sequence <= qty; sequence += 1) {
          if (existing.has(`${itemIndex}:${sequence}`)) continue;
          const now = new Date().toISOString();
          const id = `gu_legacy_${order.id}_${itemIndex}_${sequence}`;
          const code = `LEG-${order.id.replace(/[^a-z0-9]/gi, '').slice(-24).toUpperCase()}-${itemIndex + 1}-${sequence}`;
          const state = historicalUnitState(order.data.state);
          const record: GarmentUnitRecord = { id, tenant, storeId: store.currentStore(tenant), code, orderId: order.id, itemIndex, sequence, customerId, garmentId, serviceId: String(item.service || ''), unit: unit as 'Piece' | 'Pair', state, location: 'Historical', activeTagCode: code, condition: 'Normal', createdBy: actor, createdAt: order.created_at, updatedAt: now };
          store.createGarmentUnit(record);
          store.createTagHistory({ id: `th_${randomUUID()}`, tenant, storeId: record.storeId, garmentUnitId: id, tagCode: code, status: 'Active', issuedAt: order.created_at, issuedBy: actor, version: 1, createdAt: order.created_at });
          store.appendGarmentUnitEvent({ id: `gue_${randomUUID()}`, tenant, storeId: record.storeId, unitId: id, event: 'legacy_backfill', toState: state, location: 'Historical', actor, note: 'Created from a reviewed legacy order without fabricating an unknown physical location', metadata: { orderId: order.id, orderNumber: order.data.name, itemIndex, sequence, sourceOrderState: order.data.state || 'Booked' }, createdAt: now });
          applied.push({ id, orderId: order.id, tagCode: code });
          existing.add(`${itemIndex}:${sequence}`);
          if (applied.length >= 5000) break;
        }
        if (applied.length >= 5000) break;
      }
      if (applied.length >= 5000) break;
    }
    audit(tenant, actor, 'laundry:garment-backfill-applied', { after: { applied: applied.length, candidateCount: preview.candidateCount, skippedNonPhysical: preview.skippedNonPhysical } });
    return { applied: applied.length, candidateCount: preview.candidateCount, skippedNonPhysical: preview.skippedNonPhysical, capped: applied.length >= 5000, sample: applied.slice(0, 100) };
  });
}

export function bookLaundryOrder(tenant: string, actor: string, input: BookInput) {
  return store.transaction(() => {
  if (!input.expectedDeliveryDate || Number.isNaN(Date.parse(input.expectedDeliveryDate))) throw new Error('expected delivery date is required');
  const orderDate = input.orderDate || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || Number.isNaN(Date.parse(`${orderDate}T00:00:00Z`))) throw new Error('order date must be a valid calendar date');
  const photoPaths = String(input.photoPaths || '').trim();
  if (photoPaths && photoPaths.length > 1_500_000) throw new Error('order photo must be under 1 MB');
  if (photoPaths && !(/^(?:\/ui\/app\/(?:garments|brand)\/[^\s,]+|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/i.test(photoPaths))) throw new Error('order photo must be a local approved asset or PNG, JPEG, or WebP data image');
  const customer = resolveCustomer(tenant, actor, input.customer || {});
  const quote = quoteLaundryOrder(tenant, input, customer.id);
  const paymentMode = input.paymentMode || 'Pay Later';
  const supplierState = supplierStateCodeForTenant(tenant);
  const placeOfSupply = input.placeOfSupply || supplierState;
  const invoice = createRow(tenant, actor, 'sales_invoice', {
    customer: customer.id,
    posting_date: orderDate,
    place_of_supply: placeOfSupply,
    currency: 'INR',
    // Laundry operators decide when to send a customer message. Booking must never send one implicitly.
    suppress_notifications: true,
    items: invoiceItems(quote),
  });
  const submittedInvoice = submitRow(tenant, actor, 'sales_invoice', invoice.id);
  store.appendFinancialDocument({ id: `doc:${submittedInvoice.id}`, tenant, storeId: store.currentStore(tenant), documentType: 'invoice', sourceEntity: 'sales_invoice', sourceId: submittedInvoice.id, amountPaise: parseMoney(quote.grandTotal, 'invoice total'), currency: 'INR', status: submittedInvoice.status, occurredAt: submittedInvoice.updated_at, actor, metadata: { orderId: 'pending' } });
  if (process.env.EPIC_TEST_BOOKING_FAIL_AT === 'after-invoice') {
    throw new Error('forced booking failure after invoice');
  }
  // A wallet redemption is a SECOND payment leg, not a replacement for
  // paymentMode — the OTP-confirm step already moved the real money on
  // Lndry_backend before this booking call ever happened; this just
  // records that fact as its own payment_entry (mode 'LNDRY Wallet',
  // referencing the real redemption request id) and reduces what
  // paymentMode's own entry needs to cover to whatever remains.
  const walletAmountRupees = input.walletRedemption
    ? Math.max(0, Math.min(Math.round((Number(input.walletRedemption.amountPaise) || 0)) / 100, quote.grandTotal))
    : 0;
  const remainderAfterWallet = round(quote.grandTotal - walletAmountRupees);
  let walletPaymentEntry: EntityRow | undefined;
  if (walletAmountRupees > 0 && input.walletRedemption) {
    walletPaymentEntry = createRow(tenant, actor, 'payment_entry', {
      payment_type: 'Receive', party: customer.id, posting_date: orderDate, mode: 'LNDRY Wallet',
      amount: walletAmountRupees, against_sales: submittedInvoice.id, reference: input.walletRedemption.requestId, provider_status: 'Manual',
      remarks: `Wallet redemption for ${submittedInvoice.data.name}`,
    });
    submitRow(tenant, actor, 'payment_entry', walletPaymentEntry.id);
    store.appendFinancialDocument({ id: `doc:${walletPaymentEntry.id}`, tenant, storeId: store.currentStore(tenant), documentType: 'payment', sourceEntity: 'payment_entry', sourceId: walletPaymentEntry.id, amountPaise: parseMoney(walletAmountRupees, 'wallet payment amount'), currency: 'INR', status: walletPaymentEntry.status, occurredAt: walletPaymentEntry.created_at, actor, metadata: { mode: 'LNDRY Wallet', invoiceId: submittedInvoice.id, walletRedemptionRequestId: input.walletRedemption.requestId } });
    store.appendFinancialEntry({ id: `money:${walletPaymentEntry.id}:collection`, tenant, storeId: store.currentStore(tenant), kind: 'collection', sourceEntity: 'payment_entry', sourceId: walletPaymentEntry.id, direction: 'IN', amountPaise: parseMoney(walletAmountRupees, 'wallet payment amount'), currency: 'INR', occurredAt: walletPaymentEntry.created_at, actor, metadata: { mode: 'LNDRY Wallet', invoiceId: submittedInvoice.id } });
  }
  let paymentEntry: EntityRow | undefined;
  if (paymentMode !== 'Pay Later' && remainderAfterWallet > 0) {
    const cashShift = paymentMode === 'Cash' ? cashShiftForTransaction(tenant, input.cashRegister) : undefined;
    paymentEntry = createRow(tenant, actor, 'payment_entry', {
      payment_type: 'Receive', party: customer.id, posting_date: orderDate, mode: paymentMode,
      amount: remainderAfterWallet, against_sales: submittedInvoice.id, reference: input.paymentReference?.trim().slice(0, 120), provider_status: 'Manual',
      cash_shift_id: cashShift?.id, cash_register: cashShift?.data.register,
      remarks: `Laundry order payment for ${submittedInvoice.data.name}`,
    });
    submitRow(tenant, actor, 'payment_entry', paymentEntry.id);
    store.appendFinancialDocument({ id: `doc:${paymentEntry.id}`, tenant, storeId: store.currentStore(tenant), documentType: 'payment', sourceEntity: 'payment_entry', sourceId: paymentEntry.id, amountPaise: parseMoney(remainderAfterWallet, 'payment amount'), currency: 'INR', status: paymentEntry.status, occurredAt: paymentEntry.created_at, actor, metadata: { mode: paymentMode, invoiceId: submittedInvoice.id } });
    store.appendFinancialEntry({ id: `money:${paymentEntry.id}:collection`, tenant, storeId: store.currentStore(tenant), kind: 'collection', sourceEntity: 'payment_entry', sourceId: paymentEntry.id, direction: 'IN', amountPaise: parseMoney(remainderAfterWallet, 'payment amount'), currency: 'INR', occurredAt: paymentEntry.created_at, actor, metadata: { mode: paymentMode, invoiceId: submittedInvoice.id } });
  }
  const bookedPaymentAmount = round((walletPaymentEntry ? walletAmountRupees : 0) + (paymentEntry ? remainderAfterWallet : 0));
  const bookedPaymentStatus = bookedPaymentAmount >= quote.grandTotal && quote.grandTotal > 0 ? 'Paid' : bookedPaymentAmount > 0 ? 'Part Paid' : 'Unpaid';
  const order = createRow(tenant, actor, 'laundry_order', {
    customer: customer.id,
    order_date: orderDate,
    expected_delivery_date: input.expectedDeliveryDate,
    fulfillment_mode: input.fulfillmentMode,
    state: 'Booked', version: 0,
    items: quote.items,
    subtotal: quote.subtotal,
    charges: quote.charges,
    discounts: quote.discounts,
    tax_rate: quote.taxRate,
    tax_amount: quote.taxAmount,
    price_breakdown: quote.breakdown,
    grand_total: quote.grandTotal,
    payment_mode: paymentMode,
    payment_status: bookedPaymentStatus,
    invoice: submittedInvoice.id,
    payment_entry: paymentEntry?.id,
    wallet_payment_entry: walletPaymentEntry?.id,
    wallet_amount_paise: walletPaymentEntry ? Math.round(walletAmountRupees * 100) : 0,
    wallet_redemption_request_id: walletPaymentEntry ? input.walletRedemption?.requestId : undefined,
    source: 'By Store',
    notes: input.notes?.trim(),
    photo_paths: photoPaths,
    delivery_address: input.customer?.address?.trim(),
    service_zone: String(input.serviceZone || '').trim().slice(0, 120),
  });
  const invoiceDocument = store.listFinancialDocuments(tenant, { sourceId: submittedInvoice.id }).find((document) => document.documentType === 'invoice');
  if (invoiceDocument) store.appendFinancialDocument({ ...invoiceDocument, metadata: { ...(invoiceDocument.metadata || {}), orderId: order.id } });
  if (canonicalTaxEvidenceConfigured(tenant)) {
    const canonical = ensureCanonicalInvoiceForLegacy(tenant, actor, submittedInvoice.id, order.id);
    order.data.canonical_invoice_snapshot_id = canonical.id;
    store.updateRow(order);
  }
  order.status = 'Booked';
  order.updated_at = new Date().toISOString();
  store.updateRow(order);
  const createdUnits = createPhysicalUnits(tenant, actor, order.id, customer.id, quote.items);
  const createdContainers = createLaundryContainers(tenant, actor, order.id, customer.id, quote.items, input.containerCount);
  appendCustomerLedger(tenant, actor, { customer: customer.id, entryType: 'Invoice Debit', debit: quote.grandTotal, referenceType: 'laundry_order', referenceId: order.id, reason: `Order ${order.data.name || order.id}` });
  if (walletPaymentEntry) appendCustomerLedger(tenant, actor, { customer: customer.id, entryType: 'Wallet Debit', credit: walletAmountRupees, referenceType: 'payment_entry', referenceId: walletPaymentEntry.id, reason: `Wallet redemption against ${submittedInvoice.data.name || submittedInvoice.id}` });
  if (paymentEntry) appendCustomerLedger(tenant, actor, { customer: customer.id, entryType: 'Payment Credit', credit: remainderAfterWallet, referenceType: 'payment_entry', referenceId: paymentEntry.id, reason: `Payment against ${submittedInvoice.data.name || submittedInvoice.id}` });
  audit(tenant, actor, 'laundry:booked', { entity: 'laundry_order', row_id: order.id, after: { state: 'Booked', invoice: submittedInvoice.id } });
  notify(tenant, { title: `New laundry order ${order.data.name || order.id}`, body: `${customer.data.name || 'Customer'} · ₹${quote.grandTotal.toFixed(2)}`, kind: 'Laundry order', severity: 'info', ref_entity: 'laundry_order', ref_id: order.id });
  publish(tenant, 'laundry.order.booked.v1', { id: order.id, invoice: submittedInvoice.id, customer: customer.id, grand_total: quote.grandTotal });
  return { order: presentOrder(tenant, order), receipt: receiptFor(tenant, order), tags: tagsFor(tenant, order), containerTags: containerTagsFor(tenant, order), garmentUnits: createdUnits.map((unit) => presentGarmentUnit(tenant, unit)), containers: createdContainers.map((container) => presentLaundryContainer(tenant, container)) };
  });
}

function assertExpectedOrderVersion(order: EntityRow, expectedVersion?: unknown) {
  const currentVersion = Number.isInteger(Number(order.data.version)) ? Number(order.data.version) : 0;
  if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== currentVersion) throw laundryError('STALE_ORDER_VERSION', `stale order version: expected ${Number(expectedVersion)}, current ${currentVersion}`, { expectedVersion: Number(expectedVersion), currentVersion });
  return currentVersion;
}

function assertAssemblyComplete(tenant: string, orderId: string) {
  const units = store.listGarmentUnits(tenant, { orderId }).filter((unit) => unit.state !== 'Cancelled');
  const containers = store.listLaundryContainers(tenant, orderId).filter((container) => container.state !== 'Cancelled');
  const blockers = [
    ...units.filter((unit) => !['Racked', 'Dispatched', 'Delivered'].includes(unit.state)).map((unit) => `${unit.activeTagCode} (${unit.state})`),
    ...containers.filter((container) => !['Ready', 'Dispatched', 'Delivered'].includes(container.state)).map((container) => `${container.tagCode} (${container.state})`),
  ];
  if (blockers.length) throw laundryError('ASSEMBLY_INCOMPLETE', `assembly incomplete: ${blockers.slice(0, 12).join(', ')}${blockers.length > 12 ? ` and ${blockers.length - 12} more` : ''}; complete every tracked identity before marking the order Ready`, { blockers, orderId });
}

export function transitionLaundryOrder(tenant: string, actor: string, id: string, state: LaundryState, note?: string, expectedVersion?: number) {
  return store.transaction(() => {
    if (!LAUNDRY_STATES.includes(state)) throw new Error('unknown laundry order state');
    const order = store.getRow(tenant, id);
    if (!order || order.entity !== 'laundry_order') throw laundryError('ORDER_NOT_FOUND', 'laundry order not found', { orderId: id });
    const version = assertExpectedOrderVersion(order, expectedVersion);
    const from = order.data.state as LaundryState;
    if (!TRANSITIONS[from]?.includes(state)) throw new Error(`cannot move an order from ${from} to ${state}`);
    if (state === 'Picked Up' && order.data.fulfillment_mode === 'Pickup Order' && !order.data.pickup_rider) throw new Error('assign a pickup rider before marking this order picked up');
    if (state === 'Out for Delivery' && order.data.fulfillment_mode !== 'Pickup Order' && !order.data.delivery_rider) throw new Error('assign a delivery rider before dispatching this order');
    if (state === 'Ready') assertAssemblyComplete(tenant, order.id);
    order.data.state = state;
    order.data.version = version + 1;
    order.data.last_transition_note = note?.trim() || undefined;
    order.data.last_transition_at = new Date().toISOString();
    order.status = state;
    order.updated_at = new Date().toISOString();
    store.updateRow(order);
    audit(tenant, actor, 'laundry:transition', { entity: 'laundry_order', row_id: order.id, before: { state: from, version }, after: { state, version: version + 1, note: note?.trim() } });
    notify(tenant, { title: `${order.data.name || id} moved to ${state}`, body: note?.trim() || `Laundry order status changed from ${from}.`, kind: 'Fulfilment', severity: state === 'Cancelled' ? 'warning' : 'info', ref_entity: 'laundry_order', ref_id: id });
    publish(tenant, 'laundry.order.transitioned.v1', { id: order.id, from, state });
    return presentOrder(tenant, order);
  });
}

export function cancelLaundryOrder(tenant: string, actor: string, id: string, reason: string, expectedVersion?: number) {
  return store.transaction(() => {
    const order = store.getRow(tenant, id);
    if (!order || order.entity !== 'laundry_order') throw new Error('laundry order not found');
    const version = assertExpectedOrderVersion(order, expectedVersion);
    const current = String(order.data.state || 'Booked') as LaundryState;
    if (current === 'Cancelled') throw new Error('order is already cancelled');
    if (current === 'Delivered') throw new Error('delivered orders cannot be cancelled');
    const note = String(reason || '').trim().slice(0, 500);
    if (!note) throw new Error('cancellation reason is required');
    const invoice = store.getRow(tenant, String(order.data.invoice || ''));
    if (invoice?.entity === 'sales_invoice' && invoice.status === 'Submitted') {
      createLaundryCancellationCreditNote(tenant, actor, invoice, order.id, note);
      const payments = store.rowsOf(tenant, 'payment_entry').filter((payment) => payment.status === 'Submitted' && payment.data.payment_type === 'Receive' && payment.data.against_sales === invoice.id);
      for (const payment of payments) {
        const amount = round(Number(payment.data.amount || 0));
        const cancelled = cancelRow(tenant, actor, 'payment_entry', payment.id);
        const paymentDocument = store.listFinancialDocuments(tenant, { sourceId: payment.id }).find((document) => document.documentType === 'payment');
        if (paymentDocument) store.appendFinancialDocument({ ...paymentDocument, status: 'Cancelled', occurredAt: cancelled.updated_at });
        cancelled.data.provider_status = 'Reversed';
        cancelled.data.reversal_reason = note;
        cancelled.updated_at = new Date().toISOString();
        store.updateRow(cancelled);
        if (amount > 0) appendCustomerLedger(tenant, actor, { customer: String(order.data.customer), entryType: 'Refund', debit: amount, referenceType: 'payment_entry', referenceId: payment.id, reason: `Order cancellation: ${note}` });
      }
      // The submitted credit note already reverses the invoice's revenue and
      // receivable postings; only transition the original invoice's status so
      // accounting is not double-reversed.
      cancelRow(tenant, actor, 'sales_invoice', invoice.id, { postReversal: false });
      const invoiceDocument = store.listFinancialDocuments(tenant, { sourceId: invoice.id }).find((document) => document.documentType === 'invoice');
      if (invoiceDocument) store.appendFinancialDocument({ ...invoiceDocument, status: 'Cancelled', occurredAt: new Date().toISOString() });
      const total = round(Number(order.data.grand_total || invoice.data.grand_total || 0));
      if (total > 0) appendCustomerLedger(tenant, actor, { customer: String(order.data.customer), entryType: 'Adjustment', credit: total, referenceType: 'laundry_order', referenceId: order.id, reason: `Invoice reversal: ${note}` });
    }
    order.data.state = 'Cancelled';
    order.data.version = version + 1;
    order.data.payment_status = 'Unpaid';
    order.data.cancellation_reason = note;
    order.data.cancelled_at = new Date().toISOString();
    order.data.cancelled_by = actor;
    order.status = 'Cancelled';
    order.updated_at = new Date().toISOString();
    store.updateRow(order);
    for (const unit of store.listGarmentUnits(tenant, { orderId: order.id })) {
      if (unit.state === 'Delivered' || unit.state === 'Cancelled') continue;
      const fromState = unit.state;
      unit.state = 'Cancelled';
      unit.updatedAt = order.updated_at;
      store.updateGarmentUnit(unit);
      store.appendGarmentUnitEvent({ id: `gue_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: unit.id, event: 'order_cancelled', fromState, toState: 'Cancelled', location: unit.location, actor, note, metadata: { orderId: order.id }, createdAt: unit.updatedAt });
      completeOpenTask(tenant, actor, unit.id, 'Cancelled', note);
    }
    for (const container of store.listLaundryContainers(tenant, order.id)) {
      if (container.state === 'Delivered' || container.state === 'Cancelled') continue;
      const fromState = container.state;
      container.state = 'Cancelled';
      container.updatedAt = order.updated_at;
      store.updateLaundryContainer(container);
      store.appendLaundryContainerEvent({ id: `lce_${randomUUID()}`, tenant, storeId: container.storeId, containerId: container.id, event: 'order_cancelled', fromState, toState: 'Cancelled', location: container.location, actor, note, createdAt: container.updatedAt });
    }
    audit(tenant, actor, 'laundry:order-cancelled', { entity: order.entity, row_id: order.id, before: { state: current, version }, after: { state: 'Cancelled', version: version + 1, reason: note, invoice: invoice?.id } });
    notify(tenant, { title: `${order.data.name || id} cancelled`, body: note, kind: 'Cancellation', severity: 'warning', ref_entity: 'laundry_order', ref_id: id });
    publish(tenant, 'laundry.order.cancelled.v1', { id: order.id, reason: note });
    return presentOrder(tenant, order);
  });
}

export function editLaundryOrder(tenant: string, actor: string, id: string, input: EditOrderInput) {
  return store.transaction(() => {
    const order = store.getRow(tenant, id);
    if (!order || order.entity !== 'laundry_order') throw new Error('laundry order not found');
    const version = assertExpectedOrderVersion(order, input.expectedVersion);
    const current = String(order.data.state || 'Booked') as LaundryState;
    if (['Delivered', 'Cancelled'].includes(current)) throw new Error('completed or cancelled orders cannot be edited');
    if (store.rowsOf(tenant, 'laundry_fulfillment_event').some((event) => event.data.order === id && event.status === 'Submitted')) throw new Error('orders with fulfilment events cannot be edited; cancel and rebook instead');
    const existingUnits = store.listGarmentUnits(tenant, { orderId: id });
    if (existingUnits.some((unit) => store.listGarmentUnitEvents(tenant, unit.id).length > 1)) throw new Error('orders with scanned garment tags cannot be edited; cancel and rebook instead');
    const customer = store.getRow(tenant, String(order.data.customer || ''));
    if (!customer || customer.entity !== 'party') throw new Error('order customer not found');
    const quote = quoteLaundryOrder(tenant, input, customer.id);
    const invoice = store.getRow(tenant, String(order.data.invoice || ''));
    if (!invoice || invoice.entity !== 'sales_invoice' || invoice.status !== 'Submitted') throw new Error('order has no active invoice to amend');
    const submittedPayments = store.rowsOf(tenant, 'payment_entry').filter((payment) => payment.status === 'Submitted' && payment.data.payment_type === 'Receive' && payment.data.against_sales === invoice.id);
    if (submittedPayments.length) throw new Error('paid or partially paid orders cannot be edited; reverse the collection or cancel and rebook');
    const oldTotal = round(Number(order.data.grand_total || invoice.data.grand_total || 0));
    createLaundryCancellationCreditNote(tenant, actor, invoice, order.id, 'Superseded by controlled order edit');
    // The submitted credit note already reverses the superseded invoice.
    const oldInvoice = cancelRow(tenant, actor, 'sales_invoice', invoice.id, { postReversal: false });
    const oldInvoiceDocument = store.listFinancialDocuments(tenant, { sourceId: invoice.id }).find((document) => document.documentType === 'invoice');
    if (oldInvoiceDocument) store.appendFinancialDocument({ ...oldInvoiceDocument, status: 'Cancelled', occurredAt: oldInvoice.updated_at });
    const replacement = createRow(tenant, actor, 'sales_invoice', { customer: customer.id, posting_date: today(), place_of_supply: String(invoice.data.place_of_supply || supplierStateCodeForTenant(tenant)), currency: 'INR', suppress_notifications: true, items: invoiceItems(quote) });
    const submittedReplacement = submitRow(tenant, actor, 'sales_invoice', replacement.id);
    store.appendFinancialDocument({ id: `doc:${submittedReplacement.id}`, tenant, storeId: store.currentStore(tenant), documentType: 'invoice', sourceEntity: 'sales_invoice', sourceId: submittedReplacement.id, amountPaise: parseMoney(quote.grandTotal, 'invoice total'), currency: 'INR', status: submittedReplacement.status, occurredAt: submittedReplacement.updated_at, actor, metadata: { orderId: order.id, replacementOf: invoice.id } });
    order.data.expected_delivery_date = input.expectedDeliveryDate;
    order.data.fulfillment_mode = input.fulfillmentMode;
    order.data.items = quote.items;
    order.data.subtotal = quote.subtotal;
    order.data.charges = quote.charges;
    order.data.discounts = quote.discounts;
    order.data.tax_rate = quote.taxRate;
    order.data.tax_amount = quote.taxAmount;
    order.data.price_breakdown = quote.breakdown;
    order.data.grand_total = quote.grandTotal;
    order.data.payment_status = 'Unpaid';
    order.data.invoice = submittedReplacement.id;
    order.data.previous_invoice = oldInvoice.id;
    order.data.delivery_address = input.deliveryAddress?.trim() || order.data.delivery_address || customer.data.address || '';
    if (input.serviceZone !== undefined) order.data.service_zone = String(input.serviceZone || '').trim().slice(0, 120);
    order.data.notes = input.notes?.trim() ?? order.data.notes;
    order.data.edit_revision = Number(order.data.edit_revision || 0) + 1;
    order.data.version = version + 1;
    order.data.last_edit_at = new Date().toISOString();
    order.data.last_edit_by = actor;
    order.updated_at = new Date().toISOString();
    store.updateRow(order);
    if (canonicalTaxEvidenceConfigured(tenant)) {
      const canonical = ensureCanonicalInvoiceForLegacy(tenant, actor, submittedReplacement.id, order.id);
      order.data.canonical_invoice_snapshot_id = canonical.id;
      store.updateRow(order);
    }
    for (const unit of existingUnits) {
      const fromState = unit.state;
      unit.state = 'Cancelled';
      unit.updatedAt = order.updated_at;
      store.updateGarmentUnit(unit);
      store.appendGarmentUnitEvent({ id: `gue_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: unit.id, event: 'order_edited', fromState, toState: 'Cancelled', location: unit.location, actor, note: 'Superseded before processing by controlled order edit', metadata: { orderId: id }, createdAt: unit.updatedAt });
      completeOpenTask(tenant, actor, unit.id, 'Cancelled', 'Superseded before processing by controlled order edit');
    }
    createPhysicalUnits(tenant, actor, order.id, customer.id, quote.items);
    if (oldTotal > 0) appendCustomerLedger(tenant, actor, { customer: customer.id, entryType: 'Adjustment', credit: oldTotal, referenceType: 'laundry_order', referenceId: order.id, reason: 'Invoice reversal for controlled order edit' });
    if (quote.grandTotal > 0) appendCustomerLedger(tenant, actor, { customer: customer.id, entryType: 'Invoice Debit', debit: quote.grandTotal, referenceType: 'laundry_order', referenceId: order.id, reason: 'Replacement invoice after controlled order edit' });
    audit(tenant, actor, 'laundry:order-edited', { entity: order.entity, row_id: order.id, before: { invoice: invoice.id, grandTotal: oldTotal, version }, after: { invoice: submittedReplacement.id, grandTotal: quote.grandTotal, delta: round(quote.grandTotal - oldTotal), version: version + 1 } });
    notify(tenant, { title: `${order.data.name || id} updated`, body: `Replacement invoice ${submittedReplacement.data.name || submittedReplacement.id} · ₹${quote.grandTotal.toFixed(2)}`, kind: 'Order edit', severity: 'info', ref_entity: 'laundry_order', ref_id: id });
    publish(tenant, 'laundry.order.edited.v1', { id: order.id, previous_invoice: invoice.id, invoice: submittedReplacement.id, grand_total: quote.grandTotal });
    return presentOrder(tenant, order);
  });
}

export function listLaundryFulfillment(tenant: string, orderId: string) {
  const order = store.getRow(tenant, orderId);
  if (!order || order.entity !== 'laundry_order') throw new Error('laundry order not found');
  return store.rowsOf(tenant, 'laundry_fulfillment_event').filter((event) => event.data.order === orderId).map((event) => ({
    id: event.id, itemIndex: Number(event.data.item_index), stage: event.data.stage, quantity: Number(event.data.quantity), unit: event.data.unit,
    note: event.data.note || '', eventDate: event.data.event_date, createdAt: event.created_at, actor: event.created_by,
  }));
}

export function recordLaundryFulfillment(tenant: string, actor: string, orderId: string, input: FulfillmentInput) {
  return store.transaction(() => {
    const order = store.getRow(tenant, orderId);
    if (!order || order.entity !== 'laundry_order') throw new Error('laundry order not found');
    if (order.data.state === 'Cancelled') throw new Error('cancelled orders cannot receive fulfilment events');
    const itemIndex = Math.trunc(Number(input.itemIndex));
    const items = Array.isArray(order.data.items) ? order.data.items as Array<Record<string, unknown>> : [];
    const item = items[itemIndex];
    if (!item) throw new Error('order item was not found');
    const stage = input.stage;
    if (!stage || !['Picked Up', 'In Process', 'Ready', 'Delivered'].includes(stage)) throw new Error('fulfilment stage is required');
    const quantity = Math.round(Number(input.quantity) * 100) / 100;
    const ordered = Math.round((Number(item.qty) || 0) * 100) / 100;
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('fulfilment quantity must be greater than zero');
    const existing = store.rowsOf(tenant, 'laundry_fulfillment_event').filter((event) => event.data.order === orderId && Number(event.data.item_index) === itemIndex && event.data.stage === stage);
    const recorded = Math.round(existing.reduce((sum, event) => sum + (Number(event.data.quantity) || 0), 0) * 100) / 100;
    if (recorded + quantity > ordered) throw new Error(`fulfilment exceeds ordered quantity (${ordered} ${String(item.unit || 'Piece')})`);
    const event = createRow(tenant, actor, 'laundry_fulfillment_event', { order: orderId, item_index: itemIndex, stage, quantity, unit: String(item.unit || 'Piece'), note: String(input.note || '').trim().slice(0, 500), event_date: today() });
    submitRow(tenant, actor, 'laundry_fulfillment_event', event.id);
    audit(tenant, actor, 'laundry:fulfillment-recorded', { entity: event.entity, row_id: event.id, after: event.data });
    return { id: event.id, itemIndex, stage, quantity, unit: event.data.unit, note: event.data.note || '', eventDate: event.data.event_date, createdAt: event.created_at, actor: event.created_by };
  });
}

function presentGarmentUnit(tenant: string, unit: GarmentUnitRecord) {
  const order = store.getRow(tenant, unit.orderId);
  const customer = store.getRow(tenant, unit.customerId);
  const garment = store.getRow(tenant, unit.garmentId);
  const service = store.getRow(tenant, unit.serviceId);
  const expectedDeliveryDate = String(order?.data.expected_delivery_date || '');
  const isOverdue = Boolean(expectedDeliveryDate && expectedDeliveryDate < today() && !['Delivered', 'Cancelled'].includes(unit.state));
  return {
    id: unit.id, code: unit.code, tagCode: unit.activeTagCode, orderId: unit.orderId,
    orderNumber: order?.data.name || unit.orderId, customer: { id: unit.customerId, name: customer?.data.name || 'Unknown customer', phone: customer?.data.phone || '' },
    garment: { id: unit.garmentId, name: garment?.data.name || unit.garmentId }, service: { id: unit.serviceId, name: service?.data.name || unit.serviceId },
    unit: unit.unit, sequence: unit.sequence, itemIndex: unit.itemIndex, state: unit.state, location: unit.location,
    tagPayload: `ELT:v1:${unit.activeTagCode}`, tagStatus: 'Active',
    condition: unit.condition, expectedDeliveryDate, isOverdue, createdAt: unit.createdAt, updatedAt: unit.updatedAt,
  };
}

function presentLaundryContainer(tenant: string, container: LaundryContainerRecord) {
  const order = store.getRow(tenant, container.orderId);
  const customer = store.getRow(tenant, container.customerId);
  const orderItems = Array.isArray(order?.data.items) ? order.data.items as Array<Record<string, unknown>> : [];
  const orderWeightKg = round(orderItems.filter((item) => String(item.unit || '') === 'Kilogram').reduce((sum, item) => sum + Number(item.qty || 0), 0));
  return {
    id: container.id, tagCode: container.tagCode, tagPayload: `ELB:v1:${container.tagCode}`, orderId: container.orderId,
    orderNumber: order?.data.name || container.orderId, customer: { id: container.customerId, name: customer?.data.name || 'Unknown customer', phone: customer?.data.phone || '' },
    sequence: container.sequence, total: container.total, weightKg: container.total === 1 ? container.weightKg : undefined, orderWeightKg: orderWeightKg > 0 ? orderWeightKg : undefined, state: container.state, location: container.location,
    condition: container.condition, expectedDeliveryDate: order?.data.expected_delivery_date, createdAt: container.createdAt, updatedAt: container.updatedAt, deliveredAt: container.deliveredAt,
  };
}

export function getLaundryContainerDetail(tenant: string, idOrTag: string) {
  const container = store.getLaundryContainer(tenant, idOrTag);
  if (!container) throw new Error('laundry container or tag was not found');
  return { ...presentLaundryContainer(tenant, container), events: store.listLaundryContainerEvents(tenant, container.id) };
}

export function scanLaundryContainer(tenant: string, actor: string, input: ContainerScanInput) {
  return store.transaction(() => {
    const tagCode = String(input.tagCode || '').trim();
    if (!tagCode || tagCode.length > 120) throw laundryError('TAG_NOT_FOUND', 'scan a container tag or code');
    const container = store.getLaundryContainer(tenant, tagCode);
    if (!container) throw laundryError('TAG_NOT_FOUND', 'laundry container tag was not found in this store', { tagCode, kind: 'container' });
    const nextState = input.nextState;
    const alreadyAtStage = Boolean(nextState && nextState === container.state);
    if (nextState !== undefined && !Object.prototype.hasOwnProperty.call(CONTAINER_TRANSITIONS, nextState)) throw laundryError('INVALID_CONTAINER_TRANSITION', 'unknown laundry container state', { nextState });
    const location = String(input.location || container.location || '').trim().slice(0, 80) || container.location;
    const condition = String(input.condition || container.condition || 'Normal').trim().slice(0, 40) || 'Normal';
    const now = new Date().toISOString();
    if (nextState && nextState !== container.state) {
      if (!CONTAINER_TRANSITIONS[container.state].includes(nextState)) throw laundryError('INVALID_CONTAINER_TRANSITION', `cannot move a laundry container from ${container.state} to ${nextState}`, { fromState: container.state, nextState, tagCode });
      const fromState = container.state;
      const fromLocation = container.location;
      container.state = nextState; container.location = location; container.condition = condition; container.updatedAt = now;
      if (nextState === 'Delivered') container.deliveredAt = now;
      store.updateLaundryContainer(container);
      store.appendLaundryContainerEvent({ id: `lce_${randomUUID()}`, tenant, storeId: container.storeId, containerId: container.id, event: 'state_transition', fromState, toState: nextState, location, actor, note: input.note, createdAt: now });
      audit(tenant, actor, 'laundry:container-scanned', { entity: 'laundry_container', row_id: container.id, before: { state: fromState, location: fromLocation }, after: { state: nextState, location, tagCode } });
    } else {
      container.location = location; container.condition = condition; container.updatedAt = now;
      store.updateLaundryContainer(container);
      store.appendLaundryContainerEvent({ id: `lce_${randomUUID()}`, tenant, storeId: container.storeId, containerId: container.id, event: 'scan', location, actor, note: input.note, createdAt: now });
    }
    return { ...getLaundryContainerDetail(tenant, container.id), scanResult: alreadyAtStage ? 'already_at_stage' : 'accepted' };
  });
}

export function listLaundryGarmentUnits(tenant: string, filters: { orderId?: string; state?: string; search?: string } = {}) {
  return store.listGarmentUnits(tenant, filters).map((unit) => ({ ...presentGarmentUnit(tenant, unit), eventCount: store.listGarmentUnitEvents(tenant, unit.id).length, reprintCount: store.listTagReprints(tenant, unit.id).length }));
}

export function getLaundryGarmentUnit(tenant: string, idOrTag: string) {
  const unit = store.getGarmentUnit(tenant, idOrTag);
  if (!unit) throw new Error('garment unit or tag was not found');
  return { ...presentGarmentUnit(tenant, unit), events: store.listGarmentUnitEvents(tenant, unit.id), reprints: store.listTagReprints(tenant, unit.id), tagHistory: store.listTagHistory(tenant, unit.id) };
}

export function scanLaundryGarment(tenant: string, actor: string, input: GarmentScanInput) {
  return store.transaction(() => {
    const tagCode = String(input.tagCode || '').trim();
    if (!tagCode || tagCode.length > 120) throw laundryError('TAG_NOT_FOUND', 'scan a garment tag or unit code');
    const unit = store.getGarmentUnit(tenant, tagCode);
    if (!unit) {
      const historical = store.getTagHistoryByCode(tenant, tagCode);
      if (historical) {
        const replacement = historical.replacementTagId ? store.listTagHistory(tenant, historical.garmentUnitId).find((tag) => tag.id === historical.replacementTagId) : undefined;
        throw new TagRetiredError({ tagCode, garmentUnitId: historical.garmentUnitId, currentTagCode: replacement?.tagCode || 'unavailable', replacementDate: historical.retiredAt, replacementOperator: historical.retiredBy });
      }
      throw laundryError('TAG_NOT_FOUND', 'garment tag was not found in this store', { tagCode, kind: 'garment' });
    }
    const nextState = input.nextState;
    const alreadyAtStage = Boolean(nextState && nextState === unit.state);
    if (nextState !== undefined && !GARMENT_UNIT_STATES.includes(nextState)) throw laundryError('INVALID_GARMENT_TRANSITION', 'unknown garment unit state', { nextState });
    const location = String(input.location || unit.location || '').trim().slice(0, 80) || unit.location;
    const note = String(input.note || '').trim().slice(0, 500);
    const condition = String(input.condition || unit.condition || 'Normal').trim().slice(0, 40) || 'Normal';
    if (nextState && ['Rewash', 'Missing', 'Damaged'].includes(nextState) && note.length < 3) throw new Error(`${nextState} requires an operator reason`);
    if (nextState && nextState !== unit.state && !GARMENT_TRANSITIONS[unit.state as GarmentUnitState]?.includes(nextState)) throw laundryError('INVALID_GARMENT_TRANSITION', `cannot move a garment from ${unit.state} to ${nextState}`, { fromState: unit.state, nextState, tagCode });
    if (nextState && nextState !== unit.state) {
      const fromState = unit.state;
      const fromLocation = unit.location;
      validateRackLocation(tenant, unit.id, nextState, location);
      unit.state = nextState;
      unit.location = location;
      unit.condition = condition;
      unit.updatedAt = new Date().toISOString();
      store.updateGarmentUnit(unit);
      store.appendGarmentUnitEvent({ id: `gue_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: unit.id, event: 'state_transition', fromState, toState: nextState, location, actor, note, metadata: { tagCode }, createdAt: unit.updatedAt });
      completeOpenTask(tenant, actor, unit.id, nextState, note);
      if (productionStateCreatesTask(nextState)) createProductionTask(tenant, actor, unit.id, unit.orderId, nextState, note);
      audit(tenant, actor, 'laundry:garment-scanned', { entity: 'garment_unit', row_id: unit.id, before: { state: fromState, location: fromLocation }, after: { state: nextState, location, tagCode, note } });
      publish(tenant, 'laundry.garment_unit.transitioned.v1', { id: unit.id, from: fromState, state: nextState, location });
    } else {
      const now = new Date().toISOString();
      validateRackLocation(tenant, unit.id, unit.state, location);
      unit.location = location;
      unit.condition = condition;
      unit.updatedAt = now;
      store.updateGarmentUnit(unit);
      store.appendGarmentUnitEvent({ id: `gue_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: unit.id, event: 'scan', location, actor, note, metadata: { tagCode }, createdAt: now });
    }
    return { ...getLaundryGarmentUnit(tenant, unit.id), scanResult: alreadyAtStage ? 'already_at_stage' : 'accepted' };
  });
}

export function reprintLaundryTag(tenant: string, actor: string, unitId: string, input: { station?: string; reason?: string }) {
  return store.transaction(() => {
    const unit = store.getGarmentUnit(tenant, unitId);
    if (!unit) throw new Error('garment unit was not found');
    const reason = String(input.reason || '').trim().slice(0, 240);
    if (reason.length < 3) throw new Error('a reprint reason is required');
    const station = String(input.station || 'Counter').trim().slice(0, 80) || 'Counter';
    const previousTagCode = unit.activeTagCode;
    const newTagCode = previousTagCode;
    const now = new Date().toISOString();
    const reprint = { id: `tr_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: unit.id, previousTagCode, newTagCode, station, reason, actor, createdAt: now };
    store.createTagReprint(reprint);
    store.appendGarmentUnitEvent({ id: `gue_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: unit.id, event: 'tag_reprinted_same', location: unit.location, actor, note: reason, metadata: { station, tagCode: previousTagCode }, createdAt: now });
    audit(tenant, actor, 'laundry:tag-reprinted', { entity: 'garment_unit', row_id: unit.id, after: { tagCode: previousTagCode, station, reason, identityPreserved: true } });
    return { ...getLaundryGarmentUnit(tenant, unit.id), reprint };
  });
}

export function replaceLaundryTag(tenant: string, actor: string, unitId: string, input: { station?: string; reason?: string; status?: 'Lost' | 'Damaged' | 'Replaced' }) {
  return store.transaction(() => {
    const unit = store.getGarmentUnit(tenant, unitId);
    if (!unit) throw new Error('garment unit was not found');
    const reason = String(input.reason || '').trim().slice(0, 240);
    if (reason.length < 3) throw new Error('a replacement reason is required');
    const station = String(input.station || 'Counter').trim().slice(0, 80) || 'Counter';
    const oldTag = store.getTagHistoryByCode(tenant, unit.activeTagCode);
    const previousTagCode = unit.activeTagCode;
    const newTagCode = `ELT-${today().replace(/-/g, '')}-${String(store.nextSeq('garment-tag')).padStart(6, '0')}`;
    const now = new Date().toISOString();
    const replacementTag: TagHistoryRecord = { id: `th_${randomUUID()}`, tenant, storeId: unit.storeId, garmentUnitId: unit.id, tagCode: newTagCode, status: 'Active', issuedAt: now, issuedBy: actor, version: 1, createdAt: now };
    store.createTagHistory(replacementTag);
    if (oldTag) store.updateTagHistory({ ...oldTag, status: input.status || 'Replaced', retiredAt: now, retiredBy: actor, retirementReason: reason, replacementTagId: replacementTag.id, version: oldTag.version + 1 });
    unit.activeTagCode = newTagCode;
    unit.updatedAt = now;
    store.updateGarmentUnit(unit);
    const replacement = { id: `tr_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: unit.id, previousTagCode, newTagCode, station, reason, actor, createdAt: now };
    store.createTagReprint(replacement);
    store.appendGarmentUnitEvent({ id: `gue_${randomUUID()}`, tenant, storeId: unit.storeId, unitId: unit.id, event: 'tag_replaced', location: unit.location, actor, note: reason, metadata: { station, previousTagCode, newTagCode, replacementTagId: replacementTag.id }, createdAt: now });
    audit(tenant, actor, 'laundry:tag-replaced', { entity: 'garment_unit', row_id: unit.id, after: { previousTagCode, newTagCode, station, reason } });
    return { ...getLaundryGarmentUnit(tenant, unit.id), replacement };
  });
}

export function createLaundryPrintJob(tenant: string, actor: string, input: { orderId: string; templateId?: string; templateVersion?: string; printerProfile?: string; tagIds?: string[]; containerIds?: string[]; documentType?: string; requestedCopies?: number; status?: TagPrintJobStatus; failureReason?: string; outputHash?: string; evidence?: string }) {
  const order = store.getRow(tenant, input.orderId);
  if (!order || order.entity !== 'laundry_order') throw laundryError('ORDER_NOT_FOUND', 'laundry order not found', { orderId: input.orderId });
  const documentType = String(input.documentType || 'garment-tags').trim();
  if (!['invoice', 'mini-invoice', 'garment-tags', 'bag-tags', 'correction'].includes(documentType)) throw laundryError('PRINT_JOB_INVALID', 'unsupported print document type', { documentType });
  const requestedTagRefs = Array.isArray(input.tagIds) ? [...new Set(input.tagIds.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 500) : [];
  const requestedContainerRefs = Array.isArray(input.containerIds) ? [...new Set(input.containerIds.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 500) : [];
  let tagIds: string[] = [];
  if (documentType === 'garment-tags') {
    if (requestedContainerRefs.length) throw laundryError('PRINT_JOB_INVALID', 'garment print jobs cannot contain container tags', { documentType });
    const tagUnits = requestedTagRefs.map((value) => store.getGarmentUnit(tenant, value));
    if (tagUnits.some((unit) => !unit || unit.orderId !== order.id)) throw laundryError('PRINT_JOB_INVALID', 'print job contains a tag outside the selected order', { orderId: order.id });
    tagIds = tagUnits.map((unit) => unit!.id);
  } else if (documentType === 'bag-tags') {
    const containerRefs = requestedContainerRefs.length ? requestedContainerRefs : requestedTagRefs;
    const containers = containerRefs.map((value) => store.getLaundryContainer(tenant, value));
    if (containers.some((container) => !container || container.orderId !== order.id)) throw laundryError('PRINT_JOB_INVALID', 'print job contains a container outside the selected order', { orderId: order.id });
    tagIds = containers.map((container) => container!.id);
  } else if (requestedTagRefs.length || requestedContainerRefs.length) {
    throw laundryError('PRINT_JOB_INVALID', `${documentType} print jobs cannot contain physical tag IDs`, { documentType });
  }
  if (['garment-tags', 'bag-tags'].includes(documentType) && tagIds.length === 0) throw laundryError('PRINT_JOB_INVALID', `${documentType} print jobs require at least one physical tag`, { documentType });
  const status = input.status || 'Queued';
  if (!['Queued', 'Rendering', 'Printed', 'Downloaded', 'Failed', 'Cancelled'].includes(status)) throw laundryError('PRINT_JOB_INVALID', 'unsupported print job status', { status });
  if (status === 'Failed' && !String(input.failureReason || '').trim()) throw laundryError('PRINT_JOB_FAILED', 'failed print jobs require a failure reason', { documentType });
  // A print job may contain many distinct physical tag IDs, but this field is
  // the number of copies of the rendered document. The current UI renders
  // each selected tag once, so the safe default is one document copy.
  const requestedCopies = input.requestedCopies === undefined ? 1 : Number(input.requestedCopies);
  if (!Number.isSafeInteger(requestedCopies) || requestedCopies < 1 || requestedCopies > 500) throw laundryError('PRINT_JOB_INVALID', 'requested print copies must be an integer between 1 and 500', { requestedCopies });
  const job: TagPrintJobRecord = { id: `tpj_${randomUUID()}`, tenant, storeId: store.currentStore(tenant), orderId: input.orderId, templateId: String(input.templateId || 'recommended-a4-6').trim().slice(0, 120), templateVersion: String(input.templateVersion || '1').trim().slice(0, 40), printerProfile: String(input.printerProfile || 'system-default').trim().slice(0, 80), tagIds, documentType, requestedCopies, requestedBy: actor, createdAt: new Date().toISOString(), status, failureReason: input.failureReason ? String(input.failureReason).trim().slice(0, 500) : undefined, outputHash: input.outputHash ? String(input.outputHash).trim().slice(0, 160) : undefined, evidence: input.evidence ? String(input.evidence).trim().slice(0, 500) : undefined };
  store.createPrintJob(job);
  audit(tenant, actor, 'laundry:print-job-recorded', { entity: 'tag_print_job', row_id: job.id, after: { orderId: job.orderId, documentType: job.documentType, requestedCopies: job.requestedCopies, status: job.status, tagCount: job.tagIds.length } });
  return job;
}

export function listLaundryPrintJobs(tenant: string, orderId?: string) { return store.listPrintJobs(tenant, orderId); }

export function presentOrder(tenant: string, order: EntityRow) {
  const customer = store.getRow(tenant, order.data.customer);
  const invoice = store.getRow(tenant, order.data.invoice);
  const canonicalInvoice = order.data.canonical_invoice_snapshot_id ? store.getRow(tenant, String(order.data.canonical_invoice_snapshot_id)) : undefined;
  const normalizedGrandTotalPaise = invoice?.entity === 'sales_invoice' ? store.financialDocumentAmountPaise(tenant, 'invoice', invoice.entity, invoice.id) : undefined;
  const pickupRider = store.getRow(tenant, order.data.pickup_rider);
  const deliveryRider = store.getRow(tenant, order.data.delivery_rider);
  const items = Array.isArray(order.data.items) ? order.data.items : [];
  const fulfilmentEvents = store.rowsOf(tenant, 'laundry_fulfillment_event').filter((event) => event.data.order === order.id && event.status === 'Submitted');
  const itemProgress = (item: any, index: number) => {
    const ordered = round(Number(item.qty) || 0);
    const byStage = (stage: string) => round(fulfilmentEvents.filter((event) => Number(event.data.item_index) === index && event.data.stage === stage).reduce((sum, event) => sum + (Number(event.data.quantity) || 0), 0));
    const pickedUp = Math.min(ordered, byStage('Picked Up'));
    const inProcess = Math.min(ordered, byStage('In Process'));
    const ready = Math.min(ordered, byStage('Ready'));
    const delivered = Math.min(ordered, byStage('Delivered'));
    const received = Math.max(pickedUp, inProcess, ready, delivered);
    return { ...item, fulfilment: { ordered, received, delivered, pending: round(Math.max(0, ordered - delivered)), pickedUp, inProcess, ready } };
  };
  return {
    id: order.id,
    orderNumber: order.data.name || order.id,
    invoiceNumber: canonicalInvoice?.entity === 'canonical_invoice_snapshot' ? canonicalInvoice.data.invoiceNumber : invoice?.data.name || order.data.invoice,
    customer: { id: customer?.id, name: customer?.data.name || 'Unknown customer', phone: customer?.data.phone || '' },
    orderDate: order.data.order_date,
    expectedDeliveryDate: order.data.expected_delivery_date,
    fulfillmentMode: order.data.fulfillment_mode,
    deliveryAddress: order.data.delivery_address || customer?.data.address || '',
    serviceZone: order.data.service_zone || '',
    state: order.data.state,
    version: Number.isInteger(Number(order.data.version)) ? Number(order.data.version) : 0,
    itemCount: round(items.reduce((sum: number, item: any) => sum + (Number(item.qty) || 0), 0)),
    subtotal: Number(order.data.subtotal || 0),
    charges: Number(order.data.charges || 0),
    discounts: Number(order.data.discounts || 0),
    taxRate: Number(order.data.tax_rate || 0),
    taxAmount: Number(order.data.tax_amount || 0),
    grandTotal: normalizedGrandTotalPaise === undefined ? Number(order.data.grand_total || 0) : moneyNumber(normalizedGrandTotalPaise),
    breakdown: order.data.price_breakdown || {
      charges: Number(order.data.charges || 0) > 0 ? [{ label: 'Additional Charge', percent: null, amount: Number(order.data.charges || 0) }] : [],
      discounts: Number(order.data.discounts || 0) > 0 ? [{ label: 'Discount', percent: null, amount: Number(order.data.discounts || 0) }] : [],
      tax: Number(order.data.tax_amount || 0) > 0 ? { label: 'GST', percent: Number(order.data.tax_rate || 0) || null, amount: Number(order.data.tax_amount || 0) } : null,
    },
    paymentMode: order.data.payment_mode,
    paymentStatus: order.data.payment_status,
    walletAmountPaise: Number(order.data.wallet_amount_paise || 0),
    walletRedemptionRequestId: order.data.wallet_redemption_request_id || undefined,
    source: order.data.source,
    reportedBy: order.created_by,
    pickupRider: pickupRider ? { id: pickupRider.id, name: pickupRider.data.name, phone: pickupRider.data.phone || '' } : undefined,
    deliveryRider: deliveryRider ? { id: deliveryRider.id, name: deliveryRider.data.name, phone: deliveryRider.data.phone || '' } : undefined,
    pickupSlot: order.data.pickup_slot || '',
    deliverySlot: order.data.delivery_slot || '',
    items: items.map(itemProgress),
     physicalUnits: store.listGarmentUnits(tenant, { orderId: order.id }).map((unit) => presentGarmentUnit(tenant, unit)),
     containers: store.listLaundryContainers(tenant, order.id).map((container) => presentLaundryContainer(tenant, container)),
    notes: order.data.notes || '',
    photoPaths: order.data.photo_paths || '',
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}

type LaundryQueue = 'pending' | 'booking' | 'delivery' | 'delivered' | 'pickup-unassigned' | 'delivery-due' | 'delivery-unassigned' | 'express';

function queueMatches(order: ReturnType<typeof presentOrder>, queue?: string) {
  const normalized = queue as LaundryQueue | undefined;
  if (!normalized) return true;
  if (normalized === 'pending') return !['Delivered', 'Cancelled'].includes(order.state);
  if (normalized === 'booking') return order.state === 'Booked';
  if (normalized === 'delivery') return order.state === 'Out for Delivery';
  if (normalized === 'delivered') return order.state === 'Delivered';
  if (normalized === 'pickup-unassigned') return order.fulfillmentMode === 'Pickup Order' && order.state === 'Booked' && !order.pickupRider;
  if (normalized === 'delivery-due') return !['Delivered', 'Cancelled'].includes(order.state) && order.expectedDeliveryDate <= today();
  if (normalized === 'delivery-unassigned') return order.fulfillmentMode !== 'Pickup Order' && ['Ready', 'Out for Delivery'].includes(order.state) && !order.deliveryRider;
  if (normalized === 'express') return order.fulfillmentMode === 'Express Delivery' && !['Delivered', 'Cancelled'].includes(order.state);
  return true;
}

const ORDER_STATUS_STATES: Record<string, LaundryState> = {
  booked: 'Booked',
  'in-process': 'In Process',
  done: 'Ready',
  'pickup-received': 'Picked Up',
  'out-for-delivery': 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function orderStatusMatches(order: ReturnType<typeof presentOrder>, status?: string) {
  if (!status) return true;
  const statuses = [...new Set(String(status).split(',').map((value) => value.trim()).filter(Boolean))];
  const supported = new Set([...Object.keys(ORDER_STATUS_STATES), 'pickup-assigned', 'partially-delivered']);
  if (!statuses.length || statuses.length > supported.size || statuses.some((value) => !supported.has(value))) return false;
  return statuses.some((value) => orderMatchesOneStatus(order, value));
}

function orderMatchesOneStatus(order: ReturnType<typeof presentOrder>, status: string) {
  if (status === 'pickup-assigned') {
    return order.state === 'Booked' && order.fulfillmentMode === 'Pickup Order' && Boolean(order.pickupRider);
  }
  if (status === 'partially-delivered') {
    const ordered = order.items.reduce((sum, item) => sum + (Number(item.fulfilment?.ordered) || Number(item.qty) || 0), 0);
    const delivered = order.items.reduce((sum, item) => sum + (Number(item.fulfilment?.delivered) || 0), 0);
    return delivered > 0 && delivered < ordered;
  }
  const state = ORDER_STATUS_STATES[status];
  return state !== undefined && order.state === state;
}

export function listLaundryOrders(tenant: string, query: { search?: string; phone?: string; orderNo?: string; customer?: string; state?: string; status?: string; source?: string; reportedBy?: string; from?: string; to?: string; queue?: string } = {}) {
  const needle = String(query.search || '').trim().toLowerCase();
  const phone = String(query.phone || '').trim().toLowerCase().replace(/[\s()+-]/g, '');
  const orderNo = String(query.orderNo || '').trim().toLowerCase();
  const customer = String(query.customer || '').trim().toLowerCase();
  return store.rowsOf(tenant, 'laundry_order')
    .filter((order) => !query.state || order.data.state === query.state)
    .filter((order) => !query.source || order.data.source === query.source)
    .filter((order) => !query.reportedBy || order.created_by === query.reportedBy)
    .filter((order) => !query.from || order.data.order_date >= query.from)
    .filter((order) => !query.to || order.data.order_date <= query.to)
    .map((order) => presentOrder(tenant, order))
    .filter((order) => orderStatusMatches(order, query.status))
    .filter((order) => queueMatches(order, query.queue))
    .filter((order) => !phone || order.customer.phone.toLowerCase().replace(/[\s()+-]/g, '').includes(phone))
    .filter((order) => !orderNo || order.orderNumber.toLowerCase().includes(orderNo))
    .filter((order) => !customer || order.customer.name.toLowerCase().includes(customer))
    .filter((order) => !needle || [order.orderNumber, order.invoiceNumber, order.customer.name, order.customer.phone].join(' ').toLowerCase().includes(needle))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function listLaundryOrderPage(tenant: string, query: { search?: string; phone?: string; orderNo?: string; customer?: string; state?: string; status?: string; source?: string; reportedBy?: string; from?: string; to?: string; queue?: string; page?: number; pageSize?: number; cursor?: string } = {}) {
  if (!query.queue) {
    const statusValues = query.status ? [...new Set(String(query.status).split(',').map((value) => value.trim()).filter(Boolean))] : [];
    const statusState = statusValues.length === 1 ? ORDER_STATUS_STATES[statusValues[0]] : undefined;
    const stateConflict = Boolean(statusState && query.state && query.state !== statusState);
    const result = store.listLaundryOrderPage(tenant, {
      ...query,
      state: statusState ? (stateConflict ? '__no_matching_state__' : statusState) : query.state,
      status: statusState ? undefined : query.status,
    });
    const items = result.rows.map((order) => presentOrder(tenant, order));
    return { items, total: result.total, page: result.page, pageSize: result.pageSize, totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)), nextCursor: result.nextCursor, hasMore: result.hasMore };
  }
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 50));
  const page = Math.max(1, Number(query.page) || 1);
  const all = listLaundryOrders(tenant, query);
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const items = all.slice((page - 1) * pageSize, page * pageSize);
  return { items, total: all.length, page: Math.min(page, totalPages), pageSize, totalPages, nextCursor: undefined, hasMore: page < totalPages };
}

export function listLaundryOrderFilterOptions(tenant: string) {
  return store.listLaundryOrderFilterOptions(tenant);
}

export function getLaundryOrder(tenant: string, id: string) {
  const order = store.getRow(tenant, id);
  if (!order || order.entity !== 'laundry_order') throw new Error('laundry order not found');
  return {
    ...presentOrder(tenant, order),
    receipt: receiptFor(tenant, order),
     tags: tagsFor(tenant, order),
     containerTags: containerTagsFor(tenant, order),
    timeline: store.auditOf(tenant).filter((entry) => entry.row_id === id).sort((a, b) => b.ts.localeCompare(a.ts)),
  };
}

export function laundryCatalogue(tenant: string) {
  // This is a safe, idempotent catalogue migration for stores created before
  // the standard laundry-service GST rule existed. It does not alter prices,
  // historic orders, tax profiles, or any owner-configured tax rule.
  ensureStandardLaundryTaxRule(tenant);
  const categories: Array<Record<string, any> & { id: string }> = activeRows(tenant, 'laundry_category').map((row) => ({ id: row.id, ...row.data }));
  const services: Array<Record<string, any> & { id: string }> = activeRows(tenant, 'laundry_service').map((row) => ({ id: row.id, ...row.data }));
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const garments: Array<Record<string, any> & { id: string; categoryName: string }> = activeRows(tenant, 'laundry_garment').map((row) => ({ id: row.id, ...row.data, categoryName: String(categoryName.get(row.data.category) || '') }));
  const serviceName = new Map(services.map((service) => [service.id, service.name]));
  const garmentName = new Map(garments.map((garment) => [garment.id, garment.name]));
  const prices = activeRows(tenant, 'laundry_price').map((row) => ({
    id: row.id, ...row.data, garmentName: garmentName.get(row.data.garment) || '', serviceName: serviceName.get(row.data.service) || '',
  }));
  const chargeRules = activeRows(tenant, 'laundry_charge_rule').map((row) => ({ id: row.id, ...row.data }));
  const discountRules = activeRows(tenant, 'laundry_discount_rule').map((row) => ({ id: row.id, ...row.data }));
  const taxRules = activeRows(tenant, 'laundry_tax_rule').map((row) => ({ id: row.id, ...row.data }));
  const serviceUnitRecords = listLaundryServiceUnits(tenant);
  return {
    categories, services, garments, prices, chargeRules, discountRules, taxRules,
    serviceUnits: serviceUnitRecords.filter((unit) => unit.active).map((unit) => unit.value),
    serviceUnitRecords,
  };
}

/** Settings list intentionally includes switched-off categories so owners can restore them. */
export function listLaundryCategories(tenant: string): Array<Record<string, any> & { id: string; usageCount: number }> {
  const usage = new Map<string, number>();
  for (const row of store.rowsOf(tenant, 'laundry_garment')) {
    if (row.data.active === false) continue;
    const categoryId = String(row.data.category || '');
    if (categoryId) usage.set(categoryId, (usage.get(categoryId) || 0) + 1);
  }
  const rows: Array<Record<string, any> & { id: string; usageCount: number }> = store.rowsOf(tenant, 'laundry_category')
    .map((row) => ({ id: row.id, ...(row.data as Record<string, any>), usageCount: usage.get(row.id) || 0 }));
  return rows.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
}

/** Settings list includes switched-off services and reports active price-rule use. */
export function listLaundryServices(tenant: string): Array<Record<string, any> & { id: string; usageCount: number }> {
  const usage = new Map<string, number>();
  for (const row of store.rowsOf(tenant, 'laundry_price')) {
    if (row.data.active === false) continue;
    const serviceId = String(row.data.service || '');
    if (serviceId) usage.set(serviceId, (usage.get(serviceId) || 0) + 1);
  }
  const rows: Array<Record<string, any> & { id: string; usageCount: number }> = store.rowsOf(tenant, 'laundry_service')
    .map((row) => ({ id: row.id, ...(row.data as Record<string, any>), usageCount: usage.get(row.id) || 0 }));
  return rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export type LaundryServiceUnit = {
  id: string;
  value: string;
  fullName: string;
  shortName: string;
  active: boolean;
  builtIn: boolean;
  usageCount: number;
};

function serviceUnitUsage(tenant: string, value: string) {
  const garments = store.rowsOf(tenant, 'laundry_garment').filter((row) => row.data.unit === value && row.data.active !== false).length;
  const services = store.rowsOf(tenant, 'laundry_service').filter((row) => Array.isArray(row.data.units) && (row.data.units as unknown[]).includes(value) && row.data.active !== false).length;
  return garments + services;
}

export function listLaundryServiceUnits(tenant: string): LaundryServiceUnit[] {
  const rows = store.rowsOf(tenant, 'laundry_service_unit').filter((row) => row.status !== 'Cancelled');
  const standard = SERVICE_UNIT_DEFINITIONS.map((definition) => {
    const override = rows.find((row) => row.data.builtInValue === definition.value);
    return {
      id: `builtin:${definition.value}`,
      value: definition.value,
      fullName: String(override?.data.fullName || definition.fullName),
      shortName: String(override?.data.shortName || definition.shortName),
      active: true,
      builtIn: true,
      usageCount: serviceUnitUsage(tenant, definition.value),
    };
  });
  const custom = rows.filter((row) => !row.data.builtInValue).map((row) => ({
    id: row.id,
    value: String(row.data.value || row.data.fullName || ''),
    fullName: String(row.data.fullName || ''),
    shortName: String(row.data.shortName || ''),
    active: row.data.active !== false,
    builtIn: false,
    usageCount: serviceUnitUsage(tenant, String(row.data.value || row.data.fullName || '')),
  }));
  return [...standard, ...custom];
}

export function saveLaundryServiceUnit(tenant: string, actor: string, input: { fullName?: unknown; shortName?: unknown }, id?: string) {
  const fullName = String(input.fullName || '').trim().replace(/\\s+/g, ' ');
  const shortName = String(input.shortName || '').trim().replace(/\\s+/g, ' ');
  if (!fullName || fullName.length > 100) throw new Error('Full Unit Name is required and must be 100 characters or fewer');
  if (!shortName || shortName.length > 10) throw new Error('Short Unit Name is required and must be 10 characters or fewer');
  const units = listLaundryServiceUnits(tenant);
  const current = id ? units.find((unit) => unit.id === id) : undefined;
  if (id && !current) throw new Error('service unit not found');
  if (units.some((unit) => unit.id !== id && unit.fullName.toLocaleLowerCase('en') === fullName.toLocaleLowerCase('en'))) throw new Error('a service unit with this name already exists');

  return store.transaction(() => {
    if (!id) {
      const row = createRow(tenant, actor, 'laundry_service_unit', { value: fullName, fullName, shortName, active: true });
      audit(tenant, actor, 'laundry:service-unit-created', { entity: row.entity, row_id: row.id, after: row.data });
      return { id: row.id, value: fullName, fullName, shortName, active: true, builtIn: false, usageCount: 0 } satisfies LaundryServiceUnit;
    }
    if (current!.builtIn) {
      const override = store.rowsOf(tenant, 'laundry_service_unit').find((row) => row.data.builtInValue === current!.value);
      const data = { builtInValue: current!.value, value: current!.value, fullName, shortName, active: true };
      const row = override
        ? updateMaster(tenant, actor, 'laundry_service_unit', override.id, data, 'laundry:service-unit-updated')
        : createRow(tenant, actor, 'laundry_service_unit', data);
      if (!override) audit(tenant, actor, 'laundry:service-unit-updated', { entity: row.entity, row_id: row.id, after: row.data });
      return { ...current!, fullName, shortName } satisfies LaundryServiceUnit;
    }
    const row = store.getRow(tenant, id);
    if (!row || row.entity !== 'laundry_service_unit' || row.data.builtInValue) throw new Error('service unit not found');
    const oldValue = String(row.data.value || row.data.fullName || '');
    if (oldValue !== fullName) {
      for (const garment of store.rowsOf(tenant, 'laundry_garment')) {
        if (garment.data.unit === oldValue) updateMaster(tenant, actor, 'laundry_garment', garment.id, { unit: fullName }, 'laundry:service-unit-renamed');
      }
      for (const service of store.rowsOf(tenant, 'laundry_service')) {
        if (!Array.isArray(service.data.units) || !(service.data.units as unknown[]).includes(oldValue)) continue;
        updateMaster(tenant, actor, 'laundry_service', service.id, { units: [...new Set((service.data.units as unknown[]).map((unit) => unit === oldValue ? fullName : String(unit)))] }, 'laundry:service-unit-renamed');
      }
    }
    const updated = updateMaster(tenant, actor, 'laundry_service_unit', id, { value: fullName, fullName, shortName }, 'laundry:service-unit-updated');
    return { id: updated.id, value: fullName, fullName, shortName, active: updated.data.active !== false, builtIn: false, usageCount: serviceUnitUsage(tenant, fullName) } satisfies LaundryServiceUnit;
  });
}

export function setLaundryServiceUnitActive(tenant: string, actor: string, id: string, active: boolean) {
  const unit = listLaundryServiceUnits(tenant).find((candidate) => candidate.id === id);
  if (!unit) throw new Error('service unit not found');
  if (unit.builtIn) throw new Error('standard service units cannot be archived');
  const row = store.getRow(tenant, id);
  if (!row || row.entity !== 'laundry_service_unit') throw new Error('service unit not found');
  if (!active && unit.usageCount > 0) throw new Error('remove this unit from active garments and services before archiving it');
  return store.transaction(() => {
    const updated = updateMaster(tenant, actor, 'laundry_service_unit', id, { active }, active ? 'laundry:service-unit-restored' : 'laundry:service-unit-archived');
    return { ...unit, active: updated.data.active !== false };
  });
}

export function listLaundryDiscountRules(tenant: string): Array<Record<string, unknown> & { id: string }> {
  return store.rowsOf(tenant, 'laundry_discount_rule').map((row) => ({ id: row.id, ...(row.data as Record<string, unknown>) }));
}

export function listLaundryChargeRules(tenant: string): Array<Record<string, unknown> & { id: string }> {
  return store.rowsOf(tenant, 'laundry_charge_rule').map((row) => ({ id: row.id, ...(row.data as Record<string, unknown>) }));
}

function cleanName(value: unknown, label: string) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) throw new Error(`${label} must contain 2–120 characters`);
  return name;
}

function cleanActive(value: unknown, fallback = true) { return typeof value === 'boolean' ? value : fallback; }
function cleanColor(value: unknown) {
  const color = String(value || '').trim();
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('category color must be a six-digit hex value');
  return color;
}
function cleanImagePath(value: unknown) {
  const path = String(value || '').trim();
  if (!path) return '';
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(path)) {
    if (path.length > 1_500_000) throw new Error('garment image must be under 1 MB');
    return path;
  }
  if (path.length > MAX_MASTER_IMAGE_PATH || !/^\/ui\/app\/(?:garments\/(?:optimized\/)?|brand\/)[a-z0-9._-]+\.(?:png|webp|jpe?g|svg)$/i.test(path)) throw new Error('garment image must be an approved local application asset');
  return path;
}
function cleanVisualKey(value: unknown) {
  const visualKey = String(value || '').trim();
  if (!visualKey) return '';
  if (!GARMENT_VISUAL_KEYS.includes(visualKey as typeof GARMENT_VISUAL_KEYS[number])) throw new Error('garment visual key is not in the approved visual taxonomy');
  return visualKey;
}
function uniqueNamed(tenant: string, entity: string, name: string, exceptId?: string, ignoreCategoryWhitespace = false) {
  const key = (value: string) => ignoreCategoryWhitespace
    ? value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase()
    : value.trim().toLocaleLowerCase();
  const duplicate = store.rowsOf(tenant, entity).find((row) => row.id !== exceptId && key(String(row.data.name || '')) === key(name));
  if (duplicate) {
    const detail = ignoreCategoryWhitespace ? ' with the same name ignoring case and spaces' : ' with this name';
    throw new Error(`a ${entity.replace('laundry_', '').replace(/_/g, ' ')}${detail} already exists`);
  }
}
function updateMaster(tenant: string, actor: string, entity: string, id: string, data: Record<string, unknown>, action: string) {
  const row = store.getRow(tenant, id);
  if (!row || row.entity !== entity) throw new Error(`${entity.replace('laundry_', '').replace(/_/g, ' ')} not found`);
  const before = { ...row.data };
  row.data = { ...row.data, ...data };
  row.updated_at = new Date().toISOString();
  store.updateRow(row);
  audit(tenant, actor, action, { entity, row_id: id, before, after: row.data });
  return row;
}

export function saveLaundryCategory(tenant: string, actor: string, input: CategoryInput, id?: string) {
  const name = cleanName(input.name, 'category name');
  const data = { name, color: cleanColor(input.color), image: cleanImagePath(input.image), sort_order: Math.max(0, Math.trunc(Number(input.sortOrder) || 0)), active: cleanActive(input.active) };
  return store.transaction(() => {
    if (id && data.active === false && store.getRow(tenant, id)?.data.active !== false) {
      const activeGarments = store.rowsOf(tenant, 'laundry_garment').filter((row) => row.data.category === id && row.data.active !== false).length;
      if (activeGarments > 0) throw new Error('move active garments to another category before switching this category off');
    }
    uniqueNamed(tenant, 'laundry_category', name, id, true);
    const row = id ? updateMaster(tenant, actor, 'laundry_category', id, data, 'laundry:category-updated') : createRow(tenant, actor, 'laundry_category', data);
    if (!id) audit(tenant, actor, 'laundry:category-created', { entity: row.entity, row_id: row.id, after: row.data });
    return { id: row.id, ...row.data };
  });
}

export function saveLaundryService(tenant: string, actor: string, input: ServiceInput, id?: string) {
  const name = cleanName(input.name, 'service name');
  const units = Array.isArray(input.units) ? [...new Set(input.units.map(String))] : undefined;
  const supportedUnits = listLaundryServiceUnits(tenant).filter((unit) => unit.active).map((unit) => unit.value);
  if (units && (!units.length || units.some((unit) => !supportedUnits.includes(unit)))) throw new Error('service units must use the active service unit list');
  const data = { name, description: String(input.description || '').trim().slice(0, 500), units: units || supportedUnits, active: cleanActive(input.active) };
  return store.transaction(() => {
    if (id && data.active === false && store.getRow(tenant, id)?.data.active !== false) {
      const activePrices = store.rowsOf(tenant, 'laundry_price').filter((row) => row.data.service === id && row.data.active !== false).length;
      if (activePrices > 0) throw new Error('disable or move active price rules before switching this service off');
    }
    uniqueNamed(tenant, 'laundry_service', name, id);
    const row = id ? updateMaster(tenant, actor, 'laundry_service', id, data, 'laundry:service-updated') : createRow(tenant, actor, 'laundry_service', data);
    if (!id) audit(tenant, actor, 'laundry:service-created', { entity: row.entity, row_id: row.id, after: row.data });
    return { id: row.id, ...row.data };
  });
}

export function saveLaundryGarment(tenant: string, actor: string, input: GarmentInput, id?: string) {
  const existing = id ? getRequired(tenant, 'laundry_garment', id, 'garment') : undefined;
  const name = cleanName(input.name, 'garment name');
  const category = getRequired(tenant, 'laundry_category', String(input.category || ''), 'category');
  const unit = String(input.unit || 'Piece');
  if (!listLaundryServiceUnits(tenant).some((serviceUnit) => serviceUnit.active && serviceUnit.value === unit)) throw new Error('garment unit must use the active service unit list');
  const code = String(input.code || name.toUpperCase().replace(/[^A-Z0-9]+/g, '-')).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
  if (code.length < 2) throw new Error('garment code is required');
  const gstRate = round(Number(input.gstRate) || 0);
  if (gstRate < 0 || gstRate > 100) throw new Error('garment GST rate must be between 0 and 100');
  const active = cleanActive(input.active, existing?.data.active !== false);
  const visualKey = cleanVisualKey(input.visualKey ?? existing?.data.visual_key);
  if (active && !visualKey) throw new Error('an active garment requires an approved visual key or must be marked inactive until its visual is reviewed');
  const photo = cleanImagePath(input.photo === undefined ? existing?.data.photo : input.photo);
  const data = { name, code, category: category.id, unit, hsn: String(input.hsn || existing?.data.hsn || '9997').trim().slice(0, 32), gst_rate: gstRate, visual_key: visualKey, photo, active };
  return store.transaction(() => {
    uniqueNamed(tenant, 'laundry_garment', name, id);
    const duplicateCode = store.rowsOf(tenant, 'laundry_garment').find((row) => row.id !== id && String(row.data.code || '').toUpperCase() === code);
    if (duplicateCode) throw new Error('a garment with this code already exists');
    const row = id ? updateMaster(tenant, actor, 'laundry_garment', id, data, 'laundry:garment-updated') : createRow(tenant, actor, 'laundry_garment', data);
    if (!id) audit(tenant, actor, 'laundry:garment-created', { entity: row.entity, row_id: row.id, after: row.data });
    return { id: row.id, ...row.data };
  });
}

export function saveLaundryPrice(tenant: string, actor: string, input: PriceInput, id?: string) {
  const garment = getRequired(tenant, 'laundry_garment', String(input.garment || ''), 'garment');
  const service = getRequired(tenant, 'laundry_service', String(input.service || ''), 'service');
  const customerId = String(input.customer || '').trim();
  if (customerId) {
    const customer = store.getRow(tenant, customerId);
    if (!customer || customer.entity !== 'party' || !customer.data.is_customer) throw new Error('special-pricing customer not found');
  }
  const rate = moneyNumber(parseMoney(input.rate, 'price rate', { allowZero: true }));
  if (rate > 1_000_000) throw new Error('price rate must be between 0 and 1,000,000');
  const units: string[] = Array.isArray(service.data.units) ? service.data.units.map(String) : [...SERVICE_UNITS];
  if (!units.includes(String(garment.data.unit || 'Piece'))) throw new Error('this service does not support the garment unit');
  const data = { garment: garment.id, service: service.id, customer: customerId || undefined, rate, active: cleanActive(input.active) };
  return store.transaction(() => {
    const duplicate = store.rowsOf(tenant, 'laundry_price').find((row) => row.id !== id && row.data.garment === garment.id && row.data.service === service.id && String(row.data.customer || '') === customerId);
    if (duplicate) throw new Error('a matching general or customer-specific price rule already exists');
    const row = id ? updateMaster(tenant, actor, 'laundry_price', id, data, 'laundry:price-rule-updated') : createRow(tenant, actor, 'laundry_price', data);
    if (!id) audit(tenant, actor, 'laundry:price-rule-created', { entity: row.entity, row_id: row.id, after: row.data });
    return { id: row.id, ...row.data };
  });
}

/** Create a counter garment and its first general service price as one reversible catalogue action. */
export function createLaundryGarmentWithPrice(tenant: string, actor: string, input: { garment?: GarmentInput; service?: string; rate?: number }) {
  const garmentInput = input.garment || {};
  return store.transaction(() => {
    const category = getRequired(tenant, 'laundry_category', String(garmentInput.category || ''), 'category');
    if (category.data.active === false) throw new Error('choose an active garment category');
    const name = cleanName(garmentInput.name, 'garment name');
    const unit = String(garmentInput.unit || 'Piece');
    const duplicate = store.rowsOf(tenant, 'laundry_garment').find((row) => String(row.data.name || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    const code = String(garmentInput.code || duplicate?.data.code || name.toUpperCase().replace(/[^A-Z0-9]+/g, '-')).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48);
    if (duplicate && (duplicate.data.active === false || duplicate.data.category !== category.id || duplicate.data.unit !== unit || String(duplicate.data.code || '').toUpperCase() !== code)) {
      throw new Error(`“${name}” already exists with different or inactive catalogue details. Open Catalogue to review it.`);
    }
    const visualKey = String(garmentInput.visualKey || inferredGarmentVisualKey(String(garmentInput.name || ''), String(category.data.name || '')));
    const garment = duplicate
      ? { id: duplicate.id, ...duplicate.data }
      : saveLaundryGarment(tenant, actor, { ...garmentInput, name, code, unit, visualKey, active: true });
    const requestedRate = Number(input.rate);
    if (!Number.isFinite(requestedRate) || requestedRate <= 0 || requestedRate > 1_000_000) throw new Error('price must be greater than 0 and no more than 1,000,000');
    const serviceId = String(input.service || '');
    const service = getRequired(tenant, 'laundry_service', serviceId, 'service');
    if (service.data.active === false) throw new Error('choose an active service');
    const previousPrice = store.rowsOf(tenant, 'laundry_price').find((row) => row.data.garment === garment.id && row.data.service === serviceId && !row.data.customer);
    if (previousPrice) {
      if (previousPrice.data.active === false) throw new Error(`“${name}” already has a disabled price for this service. Review it in Catalogue.`);
      if (Number(previousPrice.data.rate) !== requestedRate) throw new Error(`“${name}” already has a different price for this service. Review it in Catalogue.`);
      return { garment, price: { id: previousPrice.id, ...previousPrice.data }, resumed: true };
    }
    const price = saveLaundryPrice(tenant, actor, { garment: garment.id, service: serviceId, rate: requestedRate, active: true });
    return { garment, price };
  });
}

function saveAdjustmentRule(tenant: string, actor: string, entity: 'laundry_charge_rule' | 'laundry_discount_rule', input: AdjustmentRuleInput, id?: string) {
  const name = cleanName(input.name, 'rule name');
  if (name.length > 50) throw new Error('rule name must contain 2–50 characters');
  const type = input.type === 'Percentage' ? 'Percentage' : input.type === 'Flat' ? 'Flat' : undefined;
  if (!type) throw new Error('rule type must be Flat or Percentage');
  const amount = type === 'Flat' ? moneyNumber(parseMoney(input.amount, 'rule amount', { allowZero: true })) : round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 0 || (type === 'Percentage' && amount > 100)) throw new Error('rule amount is invalid');
  const data = { name, type, amount, ...(entity === 'laundry_charge_rule' ? { expressCharge: input.expressCharge === true } : {}), description: String(input.description || '').trim().slice(0, 500), active: cleanActive(input.active) };
  return store.transaction(() => {
    uniqueNamed(tenant, entity, name, id);
    const row = id ? updateMaster(tenant, actor, entity, id, data, `laundry:${entity}-updated`) : createRow(tenant, actor, entity, data);
    if (!id) audit(tenant, actor, `laundry:${entity}-created`, { entity, row_id: row.id, after: row.data });
    return { id: row.id, ...row.data };
  });
}
export const saveLaundryChargeRule = (tenant: string, actor: string, input: AdjustmentRuleInput, id?: string) => saveAdjustmentRule(tenant, actor, 'laundry_charge_rule', input, id);
export const saveLaundryDiscountRule = (tenant: string, actor: string, input: AdjustmentRuleInput, id?: string) => saveAdjustmentRule(tenant, actor, 'laundry_discount_rule', input, id);

export function saveLaundryTaxRule(tenant: string, actor: string, input: TaxRuleInput, id?: string) {
  const name = cleanName(input.name, 'tax rule name');
  const rate = round(Number(input.rate));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('tax rate must be between 0 and 100');
  const data = { name, rate, active: cleanActive(input.active) };
  return store.transaction(() => {
    uniqueNamed(tenant, 'laundry_tax_rule', name, id);
    const row = id ? updateMaster(tenant, actor, 'laundry_tax_rule', id, data, 'laundry:tax-rule-updated') : createRow(tenant, actor, 'laundry_tax_rule', data);
    if (!id) audit(tenant, actor, 'laundry:tax-rule-created', { entity: row.entity, row_id: row.id, after: row.data });
    return { id: row.id, ...row.data };
  });
}

export function searchLaundryCustomers(tenant: string, search = '') {
  return searchCustomerRecords(tenant, search);
}

export function listLaundryRiders(tenant: string) {
  return activeRows(tenant, 'laundry_rider').map((rider) => ({ id: rider.id, name: rider.data.name, phone: rider.data.phone || '' })).sort((a, b) => a.name.localeCompare(b.name));
}

export function createLaundryRider(tenant: string, actor: string, input: RiderInput) {
  const name = input.name?.trim();
  if (!name) throw new Error('rider name is required');
  const phone = normPhone(input.phone);
  const existing = store.rowsOf(tenant, 'laundry_rider').find((rider) => rider.data.name?.trim().toLowerCase() === name.toLowerCase() || (phone && normPhone(rider.data.phone) === phone));
  if (existing) throw new Error('a rider with this name or phone already exists');
  const rider = createRow(tenant, actor, 'laundry_rider', { name, phone, active: true });
  audit(tenant, actor, 'laundry:rider-created', { entity: 'laundry_rider', row_id: rider.id, after: { name, phone } });
  return { id: rider.id, name: rider.data.name, phone: rider.data.phone || '' };
}

export function listLaundryRiderSettlements(tenant: string, query: { rider?: string; from?: string; to?: string } = {}) {
  return store.rowsOf(tenant, 'laundry_rider_settlement').filter((row) => (!query.rider || row.data.rider === query.rider) && (!query.from || String(row.data.settlement_date) >= query.from) && (!query.to || String(row.data.settlement_date) <= query.to)).map((row) => ({
    id: row.id, rider: String(row.data.rider), date: String(row.data.settlement_date), amount: Number(row.data.amount || 0), method: String(row.data.method || 'Cash'), status: String(row.data.status || 'Pending'), orderIds: Array.isArray(row.data.order_ids) ? row.data.order_ids : [], reference: String(row.data.reference || ''), notes: String(row.data.notes || ''), createdAt: row.created_at, updatedAt: row.updated_at,
  })).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function saveLaundryRiderSettlement(tenant: string, actor: string, input: RiderSettlementInput, id?: string) {
  return store.transaction(() => {
    const existing = id ? store.getRow(tenant, id) : undefined;
    if (id && (!existing || existing.entity !== 'laundry_rider_settlement')) throw new Error('rider settlement not found');
    if (existing && ['Reconciled', 'Rejected'].includes(String(existing.data.status || 'Pending'))) {
      const mutableFields = ['rider', 'date', 'amount', 'method', 'orderIds', 'reference', 'notes'];
      const changing = mutableFields.some((field) => Object.prototype.hasOwnProperty.call(input, field));
      const requestedStatus = input.status ? String(input.status) : '';
      if (changing || (requestedStatus && requestedStatus !== String(existing.data.status))) throw new Error('reconciled or rejected settlements are immutable');
    }
    const riderId = String(input.rider || existing?.data.rider || '');
    const rider = store.getRow(tenant, riderId);
    if (!rider || rider.entity !== 'laundry_rider') throw new Error('active rider not found');
    const amount = moneyNumber(parseMoney(input.amount ?? existing?.data.amount ?? 0, 'settlement amount'));
    if (amount <= 0) throw new Error('settlement amount must be greater than zero');
    const method = (input.method || String(existing?.data.method || 'Cash')) as 'Cash' | 'UPI' | 'Bank';
    if (!['Cash', 'UPI', 'Bank'].includes(method)) throw new Error('unsupported settlement method');
    const status = (input.status || String(existing?.data.status || 'Pending')) as 'Pending' | 'Handed Over' | 'Reconciled' | 'Rejected';
    if (!['Pending', 'Handed Over', 'Reconciled', 'Rejected'].includes(status)) throw new Error('unknown settlement status');
    if (existing && existing.data.status !== status) {
      // The counter UI may attest a direct reconciliation when the handover
      // happened off-screen; the intermediate Handed Over state remains
      // available for teams that require a two-step control.
      const allowed: Record<string, string[]> = { Pending: ['Handed Over', 'Reconciled', 'Rejected'], 'Handed Over': ['Reconciled', 'Rejected'], Reconciled: [], Rejected: [] };
      if (!allowed[String(existing.data.status || 'Pending')]?.includes(status)) throw new Error('settlement status transition is not allowed');
    }
    const orderIds = [...new Set((Array.isArray(input.orderIds) ? input.orderIds : Array.isArray(existing?.data.order_ids) ? existing.data.order_ids : []).map(String).filter(Boolean))];
    for (const orderId of orderIds) {
      const order = store.getRow(tenant, orderId);
      if (!order || order.entity !== 'laundry_order' || (order.data.delivery_rider !== riderId && order.data.pickup_rider !== riderId)) throw new Error(`order ${orderId} is not assigned to this rider`);
    }
    const data = { rider: riderId, settlement_date: String(input.date || existing?.data.settlement_date || today()), amount, method, status, order_ids: orderIds, reference: String(input.reference ?? existing?.data.reference ?? '').trim().slice(0, 120), notes: String(input.notes ?? existing?.data.notes ?? '').trim().slice(0, 500) };
    const row = id ? updateMaster(tenant, actor, 'laundry_rider_settlement', id, data, 'laundry:rider-settlement-updated') : createRow(tenant, actor, 'laundry_rider_settlement', data);
    row.status = 'Posted';
    row.updated_at = new Date().toISOString();
    store.updateRow(row);
    audit(tenant, actor, id ? 'laundry:rider-settlement-updated' : 'laundry:rider-settlement-created', { entity: row.entity, row_id: row.id, after: row.data });
    return listLaundryRiderSettlements(tenant, { rider: riderId }).find((entry) => entry.id === row.id)!;
  });
}

export function assignLaundryOrder(tenant: string, actor: string, id: string, input: AssignmentInput) {
  return store.transaction(() => {
    const order = store.getRow(tenant, id);
    if (!order || order.entity !== 'laundry_order') throw new Error('laundry order not found');
    if (input.stage !== 'pickup' && input.stage !== 'delivery') throw new Error('assignment stage must be pickup or delivery');
    const rider = input.riderId ? store.getRow(tenant, input.riderId) : undefined;
    if (input.riderId && (!rider || rider.entity !== 'laundry_rider' || rider.data.active === false)) throw new Error('active rider not found');
    const riderField = input.stage === 'pickup' ? 'pickup_rider' : 'delivery_rider';
    const slotField = input.stage === 'pickup' ? 'pickup_slot' : 'delivery_slot';
    const before = { rider: order.data[riderField], slot: order.data[slotField] };
    order.data[riderField] = rider?.id;
    order.data[slotField] = input.slot?.trim() || undefined;
    order.updated_at = new Date().toISOString();
    store.updateRow(order);
    audit(tenant, actor, 'laundry:rider-assigned', { entity: 'laundry_order', row_id: id, before, after: { stage: input.stage, rider: rider?.id, slot: order.data[slotField] } });
    return presentOrder(tenant, order);
  });
}

export function laundryDispatch(tenant: string) {
  const orders = listLaundryOrders(tenant);
  const operatingDate = today();
  // The dispatch board is deliberately a projection of the same orders that
  // riders operate through route runs.  It does not create a parallel status
  // model: Ready / Out for Delivery / Delivered and Booked / Picked Up remain
  // the canonical laundry lifecycle.
  return {
    riders: listLaundryRiders(tenant),
    pickups: orders.filter((order) => order.fulfillmentMode === 'Pickup Order' && order.state === 'Booked'),
    deliveries: orders.filter((order) => order.fulfillmentMode !== 'Pickup Order' && ['Ready', 'Out for Delivery'].includes(order.state)),
    deliveredToday: orders.filter((order) => order.state === 'Delivered' && String(order.updatedAt || '').slice(0, 10) === operatingDate),
    capabilities: {
      // There is no WebSocket/SSE transport in the local Fastify node yet.
      // Clients poll this projection and must not present it as push realtime.
      updateTransport: 'POLLING_FALLBACK',
      riderPresence: false,
      riderLocation: false,
      deliveryOtp: false,
      proofOfDelivery: false,
    },
  };
}

function importResult(): ImportResult { return { created: 0, updated: 0, skipped: 0, errors: [] }; }

function recordImportJob(tenant: string, actor: string, kind: 'customers' | 'prices' | 'catalogue', totalRows: number, result: ImportResult) {
  const status = result.errors.length ? 'Completed with errors' : 'Completed';
  const row = createRow(tenant, actor, 'laundry_import_job', {
    import_type: kind, status, total_rows: totalRows, created_rows: result.created, updated_rows: result.updated, skipped_rows: result.skipped,
    errors: result.errors.slice(0, 500), completed_at: new Date().toISOString(), source: 'spreadsheet',
  });
  audit(tenant, actor, 'laundry:import-completed', { entity: row.entity, row_id: row.id, after: { importType: kind, status, totalRows, created: result.created, updated: result.updated, skipped: result.skipped } });
  return { id: row.id, status };
}

export function listLaundryImportJobs(tenant: string, importType?: string) {
  return store.rowsOf(tenant, 'laundry_import_job')
    .filter((row) => !importType || row.data.import_type === importType)
    .map((row) => ({ id: row.id, importType: row.data.import_type, status: row.data.status, totalRows: Number(row.data.total_rows || 0), createdRows: Number(row.data.created_rows || 0), updatedRows: Number(row.data.updated_rows || 0), skippedRows: Number(row.data.skipped_rows || 0), errors: Array.isArray(row.data.errors) ? row.data.errors : [], completedAt: row.data.completed_at || '', createdAt: row.created_at, actor: row.created_by }))
    .sort((a, b) => `${b.completedAt}:${b.createdAt}`.localeCompare(`${a.completedAt}:${a.createdAt}`));
}

function customerImportValues(input: ImportCustomerInput) {
  const name = String(input.name || '').trim();
  const phone = normPhone(input.phone);
  if (!name) throw new Error('customer name is required');
  if (phone.length < 6) throw new Error('a valid phone is required');
  return {
    name,
    phone,
    email: String(input.email || '').trim(),
    address: String(input.address || '').trim(),
  };
}

function priceImportValues(input: ImportPriceInput) {
  const garmentName = String(input.garmentName || '').trim();
  const categoryName = String(input.categoryName || 'Imported').trim() || 'Imported';
  const serviceName = String(input.serviceName || '').trim();
  if (input.rate === undefined || input.rate === null || String(input.rate).trim() === '') throw new Error('rate is required');
  const rate = moneyNumber(parseMoney(input.rate, 'rate', { allowZero: true }));
  if (!garmentName) throw new Error('garment name is required');
  if (!serviceName) throw new Error('service name is required');
  if (!Number.isFinite(rate) || rate < 0) throw new Error('rate must be zero or greater');
  const requestedUnit = String(input.unit || 'Piece').trim();
  const unitAliases: Record<string, string> = { Quantity: 'Piece', 'Sq.Ft': 'Square Foot' };
  const allowedUnits = new Set(['Piece', 'Kilogram', 'Pair', 'Square Foot']);
  const unit = unitAliases[requestedUnit] || requestedUnit;
  if (!allowedUnits.has(unit)) throw new Error('unit must be Piece, Quantity, Kilogram, Pair, Square Foot or Sq.Ft');
  return {
    garmentName,
    categoryName,
    serviceName,
    rate,
    unit,
    hsn: String(input.hsn || '9997').trim() || '9997',
    gstRate: Math.max(0, round(Number(input.gstRate) || 0)),
    customerPhone: normPhone(input.customerPhone),
    visualKey: String(input.visualKey || '').trim(),
    photo: input.photo,
  };
}

export function previewLaundryImport(tenant: string, importType: 'customers' | 'prices', input: unknown) {
  if (!Array.isArray(input)) throw new Error(importType + ' import must be a list of rows');
  if (input.length === 0) throw new Error(importType + ' import has no rows');
  if (input.length > 2_000) throw new Error(importType + ' import is limited to 2,000 rows at a time');

  const errors: ImportIssue[] = [];
  if (importType === 'customers') {
    (input as ImportCustomerInput[]).forEach((row, index) => {
      try {
        customerImportValues(row);
      } catch (error: any) {
        errors.push({ row: index + 2, message: error.message || 'Invalid row' });
      }
    });
  } else {
    const categories = store.rowsOf(tenant, 'laundry_category');
    const garments = store.rowsOf(tenant, 'laundry_garment');
    const customers = store.rowsOf(tenant, 'party').filter((row) => row.data.is_customer);
    const virtualCategories = new Set<string>();
    const virtualGarments = new Set<string>();

    (input as ImportPriceInput[]).forEach((row, index) => {
      try {
        const values = priceImportValues(row);
        if (values.customerPhone && !customers.some((customer) => normPhone(customer.data.phone) === values.customerPhone)) {
          throw new Error('customer phone does not match an imported customer');
        }

        const category = categories.find((entry) => String(entry.data.name || '').trim().toLowerCase() === values.categoryName.toLowerCase());
        const categoryKey = category?.id || values.categoryName.toLowerCase();
        const garmentKey = categoryKey + '|' + values.garmentName.toLowerCase();
        const existingGarment = Boolean(category && garments.some((entry) =>
          String(entry.data.name || '').trim().toLowerCase() === values.garmentName.toLowerCase() && entry.data.category === category.id,
        ));
        if (!existingGarment && !virtualGarments.has(garmentKey)) {
          if (!values.visualKey) throw new Error('Create this garment in Garments first, or add an approved Visual Key before importing its price');
          cleanVisualKey(values.visualKey);
          cleanImagePath(values.photo);
          virtualGarments.add(garmentKey);
          if (!category) virtualCategories.add(values.categoryName.toLowerCase());
        } else if (!category && !virtualCategories.has(values.categoryName.toLowerCase())) {
          virtualCategories.add(values.categoryName.toLowerCase());
        }
      } catch (error: any) {
        errors.push({ row: index + 2, message: error.message || 'Invalid row' });
      }
    });
  }
  return { totalRows: input.length, readyRows: input.length - errors.length, errors };
}

export function importLaundryCustomers(tenant: string, actor: string, rows: ImportCustomerInput[]) {
  if (!Array.isArray(rows)) throw new Error('customer import must be a list of rows');
  if (rows.length === 0) throw new Error('customer import has no rows');
  if (rows.length > 2_000) throw new Error('customer import is limited to 2,000 rows at a time');
  const result = importResult();
  rows.forEach((input, index) => {
    try {
      const { name, phone, email, address } = customerImportValues(input);
      const existing = store.rowsOf(tenant, 'party').find((row) => normPhone(row.data.phone) === phone);
      if (existing) {
        existing.data = { ...existing.data, name, phone, email: email || existing.data.email, address: address || existing.data.address, is_customer: true };
        existing.updated_at = new Date().toISOString();
        store.updateRow(existing);
        result.updated += 1;
      } else {
        createRow(tenant, actor, 'party', { name, phone, email, address, is_customer: true });
        result.created += 1;
      }
    } catch (error: any) { result.skipped += 1; result.errors.push({ row: index + 2, message: error.message || 'Invalid row' }); }
  });
  result.job = recordImportJob(tenant, actor, 'customers', rows.length, result);
  audit(tenant, actor, 'laundry:customers-imported', { after: { ...result, errors: result.errors.slice(0, 20) } });
  return result;
}

function findNamedRow(tenant: string, entity: string, name: string) {
  const target = name.trim().toLowerCase();
  return store.rowsOf(tenant, entity).find((row) => String(row.data.name || '').trim().toLowerCase() === target);
}

export function importLaundryPrices(tenant: string, actor: string, rows: ImportPriceInput[]) {
  if (!Array.isArray(rows)) throw new Error('price import must be a list of rows');
  if (rows.length === 0) throw new Error('price import has no rows');
  if (rows.length > 2_000) throw new Error('price import is limited to 2,000 rows at a time');
  const result = importResult();
  rows.forEach((input, index) => {
    try {
      const values = priceImportValues(input);
      const existingCategory = findNamedRow(tenant, 'laundry_category', values.categoryName);
      // A reference catalogue can legitimately reuse a display name across
      // categories (for example CAP or TOWEL). Keep those rows distinct by
      // category instead of silently attaching every price to the first match.
      let garment = existingCategory ? store.rowsOf(tenant, 'laundry_garment').find((row) =>
        String(row.data.name || '').trim().toLowerCase() === values.garmentName.toLowerCase() && row.data.category === existingCategory.id,
      ) : undefined;
      const customer = values.customerPhone ? store.rowsOf(tenant, 'party').find((row) => normPhone(row.data.phone) === values.customerPhone && row.data.is_customer) : undefined;
      if (values.customerPhone && !customer) throw new Error('customer phone does not match an imported customer');
      let visualKey = '';
      let photo = '';
      if (!garment) {
        visualKey = cleanVisualKey(values.visualKey);
        if (!visualKey) throw new Error('new imported garments require an approved visual key before activation');
        photo = cleanImagePath(values.photo);
      }
      const category = existingCategory || createRow(tenant, actor, 'laundry_category', { name: values.categoryName, active: true });
      const service = findNamedRow(tenant, 'laundry_service', values.serviceName) || createRow(tenant, actor, 'laundry_service', { name: values.serviceName, active: true });
      if (!garment) {
        garment = createRow(tenant, actor, 'laundry_garment', {
          name: values.garmentName, code: values.garmentName.toUpperCase().replace(/[^A-Z0-9]+/g, '-'), category: category.id, unit: values.unit,
          hsn: values.hsn, gst_rate: values.gstRate, visual_key: visualKey, photo, active: true,
        });
      }
      const existingPrice = store.rowsOf(tenant, 'laundry_price').find((row) => row.data.garment === garment!.id && row.data.service === service.id && row.data.customer === customer?.id);
      if (existingPrice) {
        existingPrice.data = { ...existingPrice.data, rate: values.rate, active: true };
        existingPrice.updated_at = new Date().toISOString();
        store.updateRow(existingPrice);
        result.updated += 1;
      } else {
        createRow(tenant, actor, 'laundry_price', { garment: garment.id, service: service.id, customer: customer?.id, rate: values.rate, active: true });
        result.created += 1;
      }
    } catch (error: any) { result.skipped += 1; result.errors.push({ row: index + 2, message: error.message || 'Invalid row' }); }
  });
  result.job = recordImportJob(tenant, actor, 'prices', rows.length, result);
  audit(tenant, actor, 'laundry:prices-imported', { after: { ...result, errors: result.errors.slice(0, 20) } });
  return result;
}

function importRows(input: unknown, label: string, max: number) {
  if (!Array.isArray(input)) throw new Error(`${label} must be a list`);
  if (input.length > max) throw new Error(`${label} is limited to ${max} rows at a time`);
  return input as Array<Record<string, unknown> & { id?: string }>;
}

function resolveMasterReference(tenant: string, entity: string, reference: unknown, maps: Map<string, string>, label: string) {
  const raw = String(reference || '').trim();
  if (!raw) throw new Error(`${label} is required`);
  const mapped = maps.get(raw.toLowerCase());
  if (mapped) return mapped;
  const byId = store.getRow(tenant, raw);
  if (byId?.entity === entity && byId.data.active !== false) return byId.id;
  const byName = findNamedRow(tenant, entity, raw);
  if (byName && byName.data.active !== false) return byName.id;
  throw new Error(`${label} ${raw} was not found`);
}

/**
 * Merge an owner-supplied master catalogue into one branch. The import is
 * deliberately all-or-nothing: a snapshot is restored if any reference,
 * validation rule, or persistence operation fails. Imported IDs are treated as
 * hints only; names and scoped entity types prevent cross-workspace leakage.
 */
export function importLaundryCatalogue(tenant: string, actor: string, input: LaundryCatalogueImportInput) {
  const categories = importRows(input?.categories || [], 'catalogue categories', 500);
  const services = importRows(input?.services || [], 'catalogue services', 500);
  const garments = importRows(input?.garments || [], 'catalogue garments', 2_000);
  const prices = importRows(input?.prices || [], 'catalogue prices', 10_000);
  const chargeRules = importRows(input?.chargeRules || [], 'catalogue charge rules', 500);
  const discountRules = importRows(input?.discountRules || [], 'catalogue discount rules', 500);
  const taxRules = importRows(input?.taxRules || [], 'catalogue tax rules', 500);
  const totalRows = categories.length + services.length + garments.length + prices.length + chargeRules.length + discountRules.length + taxRules.length;
  if (!totalRows) throw new Error('catalogue import has no rows');
  const before = store.snapshotFor(tenant, store.currentStore(tenant));
  const result = importResult();
  const categoryMap = new Map<string, string>();
  const serviceMap = new Map<string, string>();
  const garmentMap = new Map<string, string>();
  try {
    for (const row of categories) {
      const existingById = row.id ? store.getRow(tenant, row.id) : undefined;
      const existing = existingById?.entity === 'laundry_category' ? existingById : findNamedRow(tenant, 'laundry_category', String(row.name || ''));
      const saved = saveLaundryCategory(tenant, actor, row as CategoryInput, existing?.id);
      if (existing) result.updated += 1; else result.created += 1;
      categoryMap.set(String(row.name || '').trim().toLowerCase(), saved.id);
      if (row.id) categoryMap.set(String(row.id).toLowerCase(), saved.id);
    }
    for (const row of services) {
      const existingById = row.id ? store.getRow(tenant, row.id) : undefined;
      const existing = existingById?.entity === 'laundry_service' ? existingById : findNamedRow(tenant, 'laundry_service', String(row.name || ''));
      const saved = saveLaundryService(tenant, actor, row as ServiceInput, existing?.id);
      if (existing) result.updated += 1; else result.created += 1;
      serviceMap.set(String(row.name || '').trim().toLowerCase(), saved.id);
      if (row.id) serviceMap.set(String(row.id).toLowerCase(), saved.id);
    }
    for (const row of garments) {
      const category = resolveMasterReference(tenant, 'laundry_category', row.category, categoryMap, 'garment category');
      const normalized = { ...row, category } as GarmentInput;
      const existingById = row.id ? store.getRow(tenant, row.id) : undefined;
      const existing = existingById?.entity === 'laundry_garment' ? existingById : store.rowsOf(tenant, 'laundry_garment').find((candidate) => String(candidate.data.name || '').trim().toLowerCase() === String(row.name || '').trim().toLowerCase() && candidate.data.category === category);
      const saved = saveLaundryGarment(tenant, actor, normalized, existing?.id);
      if (existing) result.updated += 1; else result.created += 1;
      garmentMap.set(String(row.name || '').trim().toLowerCase(), saved.id);
      if (row.id) garmentMap.set(String(row.id).toLowerCase(), saved.id);
    }
    for (const row of prices) {
      const garment = resolveMasterReference(tenant, 'laundry_garment', row.garment, garmentMap, 'price garment');
      const service = resolveMasterReference(tenant, 'laundry_service', row.service, serviceMap, 'price service');
      const customer = String(row.customer || '').trim();
      const existingById = row.id ? store.getRow(tenant, row.id) : undefined;
      const existing = existingById?.entity === 'laundry_price' ? existingById : store.rowsOf(tenant, 'laundry_price').find((candidate) => candidate.data.garment === garment && candidate.data.service === service && String(candidate.data.customer || '') === customer);
      const saved = saveLaundryPrice(tenant, actor, { ...row, garment, service, customer } as PriceInput, existing?.id);
      if (existing) result.updated += 1; else result.created += 1;
      if (row.id) garmentMap.set(`price:${String(row.id).toLowerCase()}`, saved.id);
    }
    for (const [rows, save] of [[chargeRules, saveLaundryChargeRule], [discountRules, saveLaundryDiscountRule], [taxRules, saveLaundryTaxRule]] as const) {
      for (const row of rows) {
        const entity = save === saveLaundryChargeRule ? 'laundry_charge_rule' : save === saveLaundryDiscountRule ? 'laundry_discount_rule' : 'laundry_tax_rule';
        const existingById = row.id ? store.getRow(tenant, row.id) : undefined;
        const existing = existingById?.entity === entity ? existingById : findNamedRow(tenant, entity, String(row.name || ''));
        save(tenant, actor, row as any, existing?.id);
        if (existing) result.updated += 1; else result.created += 1;
      }
    }
    result.job = recordImportJob(tenant, actor, 'catalogue', totalRows, result);
    audit(tenant, actor, 'laundry:catalogue-imported', { after: { totalRows, created: result.created, updated: result.updated, jobId: result.job.id } });
    return result;
  } catch (error) {
    store.replaceScoped(tenant, store.currentStore(tenant), before);
    throw error;
  }
}

export function laundryDashboard(tenant: string, asOf = today()) {
  const all = listLaundryOrders(tenant);
  const expenses = listLaundryExpenses(tenant);
  const marketplaceOrders = store.listMarketplaceOrderProjections(tenant);
  const marketplacePickupTasks = store.rowsOf(tenant, 'marketplace_pickup_task').filter((row) => row.status === 'Active');
  const marketplaceActive = marketplaceOrders.filter((order) => !['Completed', 'Cancelled', 'Rejected', 'Expired'].includes(order.state));
  const acceptanceDeadlinePassed = (value?: string) => Boolean(value && Date.parse(value) <= Date.now());
  const marketplaceChannelBreakdown = Object.fromEntries([...new Set(marketplaceOrders.map((order) => order.channel))].sort().map((channel) => [channel, marketplaceOrders.filter((order) => order.channel === channel).length]));
  const syncOutbox = store.syncOutboxCounts(tenant);
  const syncInbox = store.syncInboxCounts(tenant);
  const device = store.getMarketplaceDevice(tenant);
  const todayOrders = all.filter((order) => order.orderDate === asOf);
  const active = all.filter((order) => !['Delivered', 'Cancelled'].includes(String(order.state)));
  const awaitingPickup = all.filter((order) => order.fulfillmentMode === 'Pickup Order' && order.state === 'Booked' && !order.pickupRider);
  const awaitingDelivery = all.filter((order) => order.fulfillmentMode !== 'Pickup Order' && ['Ready', 'Out for Delivery'].includes(order.state) && !order.deliveryRider);
  const stateCount = (state: LaundryState) => all.filter((order) => order.state === state).length;
  const trendFrom = shiftDate(asOf, -6);
  return {
    asOf,
    kpis: {
      collection: round(collectionsForOrders(tenant, todayOrders, asOf, asOf).reduce((sum, row) => sum + row.amount, 0)),
      orderRequests: marketplaceOrders.filter((order) => order.state === 'AwaitingAcceptance').length,
      pendingOrders: active.length,
      booking: stateCount('Booked'),
      delivery: stateCount('Out for Delivery'),
      delivered: stateCount('Delivered'),
      todayRevenue: round(todayOrders.filter((order) => order.state !== 'Cancelled').reduce((sum, order) => sum + order.grandTotal, 0)),
      upcomingDeliveries: active.filter((order) => order.expectedDeliveryDate <= asOf).length,
    },
    attention: [
      { id: 'pickup', label: 'Pending / unassigned pickup', count: awaitingPickup.length, tone: 'amber' },
      { id: 'upcoming', label: 'Upcoming delivery', count: active.filter((order) => order.expectedDeliveryDate <= asOf).length, tone: 'blue' },
      { id: 'unassigned', label: 'Unassigned delivery', count: awaitingDelivery.length, tone: 'slate' },
      { id: 'express', label: 'Express delivery', count: active.filter((order) => order.fulfillmentMode === 'Express Delivery').length, tone: 'rose' },
      { id: 'requests', label: 'Order requests', count: marketplaceOrders.filter((order) => order.state === 'AwaitingAcceptance').length, tone: 'slate' },
    ],
    trend: dailySeries(all, expenses, collectionsForOrders(tenant, all), trendFrom, asOf),
    fulfillmentBreakdown: fulfillmentSeries(all),
    topGarments: topItemSeries(all, 'garmentName'),
    topServices: topItemSeries(all, 'serviceName'),
    recent: all.slice(0, 8),
    marketplace: {
      configured: device?.status === 'Registered',
      newOrders: marketplaceOrders.filter((order) => order.state === 'AwaitingAcceptance').length,
      awaitingAcceptance: marketplaceOrders.filter((order) => order.state === 'AwaitingAcceptance').length,
      pickupToday: marketplacePickupTasks.filter((row) => String(row.data.scheduledDate || '') === asOf && !['Collected', 'Failed', 'Cancelled'].includes(String(row.data.state))).length,
      intakePending: marketplaceOrders.filter((order) => order.state === 'IntakeRequired').length,
      customerApprovalRequired: marketplaceOrders.filter((order) => order.state === 'CustomerApprovalRequired').length,
      overdue: marketplaceActive.filter((order) => acceptanceDeadlinePassed(order.acceptanceDeadline) || Boolean(order.request.expectedDeliveryDate && String(order.request.expectedDeliveryDate) < asOf)).length,
      productionRisk: marketplaceActive.filter((order) => ['Accepted', 'PickupScheduled', 'IntakeRequired', 'CustomerApprovalRequired', 'Processing'].includes(order.state) && Boolean(order.request.expectedDeliveryDate && String(order.request.expectedDeliveryDate) <= asOf)).length,
      ready: marketplaceOrders.filter((order) => order.state === 'Ready').length,
      deliveryToday: marketplaceOrders.filter((order) => order.state === 'DeliveryScheduled' && String(order.request.deliveryDate || order.request.expectedDeliveryDate || '') === asOf).length,
      paymentAttention: marketplaceActive.filter((order) => ['Pending', 'Failed', 'Unknown'].includes(order.paymentState)).length,
      syncIssues: syncOutbox.Retry + syncOutbox.DeadLetter + syncInbox.Held + syncInbox.Failed,
      channelBreakdown: marketplaceChannelBreakdown,
    },
    // Deliberately separate from `kpis`/`topGarments`/`topServices` above,
    // which are counter-sales-only — these figures are pre-finalization
    // estimates from real pulled orders (payableAmountPaise, before any
    // reconciliation), not settled revenue, and are never blended into one
    // total. Includes every non-terminal-cancelled order regardless of
    // whether it has been through local intake yet.
    online: {
      count: marketplaceOrders.filter((order) => !MARKETPLACE_TERMINAL_EXCLUDED.includes(order.state)).length,
      todayCount: marketplaceOrders.filter((order) => !MARKETPLACE_TERMINAL_EXCLUDED.includes(order.state) && String(order.createdAt || '').slice(0, 10) === asOf).length,
      estimatedRevenue: round(marketplaceOrders.filter((order) => !MARKETPLACE_TERMINAL_EXCLUDED.includes(order.state)).reduce((sum, order) => sum + (Number((order.request as Record<string, unknown> | undefined)?.payableAmountPaise) || 0) / 100, 0)),
      topGarments: marketplaceTopGarments(marketplaceOrders),
    },
  };
}

function accountFor(tenant: string, actor: string, name: string, accountType: string) {
  const existing = store.rowsOf(tenant, 'account').find((row) => row.data.name === name);
  return existing || createRow(tenant, actor, 'account', { name, account_type: accountType });
}

function paymentAccountName(mode: string) {
  if (mode === 'Cash') return 'Cash (Assets)';
  if (mode === 'UPI') return 'Bank/UPI (Assets)';
  if (mode === 'Card') return 'Bank/Card (Assets)';
  return 'Bank (Assets)';
}

export function createLaundryExpense(tenant: string, actor: string, input: ExpenseInput) {
  const amount = moneyNumber(parseMoney(input.amount, 'expense amount'));
  if (!input.expenseName?.trim()) throw new Error('expense name is required');
  if (!input.expenseDate || Number.isNaN(Date.parse(input.expenseDate))) throw new Error('expense date is required');
  if (amount <= 0) throw new Error('expense amount must be greater than zero');
  const attachment = String(input.attachment || '').trim();
  if (attachment && (attachment.length > 1_500_000 || !/^data:(?:application\/pdf|image\/(?:png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/i.test(attachment))) throw new Error('expense attachment must be a PDF, PNG, JPEG, or WebP under 1 MB');
  const paymentMode = input.paymentMode || 'Cash';
  return store.transaction(() => {
    const cashShift = paymentMode === 'Cash' ? cashShiftForTransaction(tenant, input.cashRegister) : undefined;
    const expenseAccount = accountFor(tenant, actor, 'Laundry Operating Expense (Expense)', 'Expense');
    const paidFrom = accountFor(tenant, actor, paymentAccountName(paymentMode), 'Asset');
    const journal = createRow(tenant, actor, 'journal_entry', {
      posting_date: input.expenseDate,
      remark: `Laundry expense: ${input.expenseName.trim()}`,
      entries: [
        { account: expenseAccount.id, debit: amount, credit: 0 },
        { account: paidFrom.id, debit: 0, credit: amount },
      ],
    });
    submitRow(tenant, actor, 'journal_entry', journal.id);
    const expense = createRow(tenant, actor, 'laundry_expense', {
      expense_name: input.expenseName.trim(), expense_date: input.expenseDate, amount, finance_category: financeExpenseCategory(input.financeCategory),
      payment_receiver: input.paymentReceiver?.trim(), invoice_number: input.invoiceNumber?.trim(),
      is_tax_paid: Boolean(input.isTaxPaid), payment_mode: paymentMode, journal_entry: journal.id, notes: input.notes?.trim(), attachment,
      cash_shift_id: cashShift?.id, cash_register: cashShift?.data.register,
    });
    expense.status = 'Paid';
    expense.updated_at = new Date().toISOString();
    store.updateRow(expense);
    store.appendFinancialEntry({ id: `money:${expense.id}:expense`, tenant, storeId: store.currentStore(tenant), kind: 'expense', sourceEntity: 'laundry_expense', sourceId: expense.id, direction: 'OUT', amountPaise: parseMoney(amount, 'expense amount'), currency: 'INR', occurredAt: expense.created_at, actor, metadata: { paymentMode, journalId: journal.id } });
    store.appendFinancialDocument({ id: `doc:${expense.id}`, tenant, storeId: store.currentStore(tenant), documentType: 'expense', sourceEntity: 'laundry_expense', sourceId: expense.id, amountPaise: parseMoney(amount, 'expense amount'), currency: 'INR', status: expense.status, occurredAt: expense.created_at, actor, metadata: { paymentMode, journalId: journal.id } });
    audit(tenant, actor, 'laundry:expense-recorded', { entity: 'laundry_expense', row_id: expense.id, after: { amount, journal: journal.id } });
    return presentExpense(expense, tenant);
  });
}

export function presentExpense(expense: EntityRow, tenant?: string) {
  const normalizedAmountPaise = tenant ? store.financialDocumentAmountPaise(tenant, 'expense', expense.entity, expense.id) : undefined;
  return {
    id: expense.id, reference: expense.data.name || expense.id, expenseName: expense.data.expense_name, financeCategory: String(expense.data.finance_category || 'UNCLASSIFIED'), cashRegister: expense.data.cash_register || '',
    expenseDate: expense.data.expense_date, amount: normalizedAmountPaise === undefined ? Number(expense.data.amount || 0) : moneyNumber(normalizedAmountPaise),
    paymentReceiver: expense.data.payment_receiver || '', invoiceNumber: expense.data.invoice_number || '',
    isTaxPaid: Boolean(expense.data.is_tax_paid), paymentMode: expense.data.payment_mode || 'Cash',
    journalEntry: expense.data.journal_entry, notes: expense.data.notes || '', attachment: expense.data.attachment || '', status: expense.status, actor: expense.created_by, createdAt: expense.created_at,
  };
}

export function cancelLaundryExpense(tenant: string, actor: string, id: string, reason: string) {
  return store.transaction(() => {
    const expense = store.getRow(tenant, id);
    if (!expense || expense.entity !== 'laundry_expense') throw new Error('expense not found');
    if (expense.status !== 'Paid') throw new Error('only paid expenses can be cancelled');
    const note = String(reason || '').trim().slice(0, 500);
    if (!note) throw new Error('expense cancellation reason is required');
    const journal = store.getRow(tenant, String(expense.data.journal_entry || ''));
    if (journal?.status === 'Submitted') cancelRow(tenant, actor, 'journal_entry', journal.id);
    expense.status = 'Cancelled'; expense.data.cancellation_reason = note; expense.updated_at = new Date().toISOString(); store.updateRow(expense);
    const document = store.listFinancialDocuments(tenant, { sourceId: expense.id }).find((entry) => entry.documentType === 'expense');
    if (document) store.appendFinancialDocument({ ...document, status: 'Cancelled', occurredAt: expense.updated_at, metadata: { ...(document.metadata || {}), reason: note } });
    audit(tenant, actor, 'laundry:expense-cancelled', { entity: expense.entity, row_id: expense.id, after: { reason: note } });
    return presentExpense(expense, tenant);
  });
}

export function editLaundryExpense(tenant: string, actor: string, id: string, input: ExpenseInput, reason: string) {
  return store.transaction(() => {
    const expense = store.getRow(tenant, id);
    if (!expense || expense.entity !== 'laundry_expense') throw new Error('expense not found');
    if (expense.status !== 'Paid') throw new Error('only paid expenses can be edited');
    const note = String(reason || '').trim().slice(0, 500);
    if (!note) throw new Error('expense edit reason is required');
    const amount = moneyNumber(parseMoney(input.amount, 'expense amount'));
    const name = String(input.expenseName || '').trim();
    if (!name) throw new Error('expense name is required');
    if (!input.expenseDate || Number.isNaN(Date.parse(input.expenseDate))) throw new Error('expense date is required');
    if (amount <= 0) throw new Error('expense amount must be greater than zero');
    const attachment = String(input.attachment || '').trim();
    if (attachment && (attachment.length > 1_500_000 || !/^data:(?:application\/pdf|image\/(?:png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/i.test(attachment))) throw new Error('expense attachment must be a PDF, PNG, JPEG, or WebP under 1 MB');
    const paymentMode = input.paymentMode || 'Cash';
    const cashShift = paymentMode === 'Cash' ? cashShiftForTransaction(tenant, input.cashRegister) : undefined;
    const oldJournal = store.getRow(tenant, String(expense.data.journal_entry || ''));
    if (oldJournal?.status === 'Submitted') cancelRow(tenant, actor, 'journal_entry', oldJournal.id);
    const expenseAccount = accountFor(tenant, actor, 'Laundry Operating Expense (Expense)', 'Expense');
    const paidFrom = accountFor(tenant, actor, paymentAccountName(paymentMode), 'Asset');
    const journal = createRow(tenant, actor, 'journal_entry', { posting_date: input.expenseDate, remark: `Laundry expense edit: ${name}`, entries: [{ account: expenseAccount.id, debit: amount, credit: 0 }, { account: paidFrom.id, debit: 0, credit: amount }] });
    submitRow(tenant, actor, 'journal_entry', journal.id);
    const before = presentExpense(expense, tenant);
    expense.data = { ...expense.data, expense_name: name, expense_date: input.expenseDate, amount, finance_category: financeExpenseCategory(input.financeCategory || expense.data.finance_category), payment_receiver: input.paymentReceiver?.trim(), invoice_number: input.invoiceNumber?.trim(), is_tax_paid: Boolean(input.isTaxPaid), payment_mode: paymentMode, cash_shift_id: cashShift?.id, cash_register: cashShift?.data.register, journal_entry: journal.id, previous_journal_entry: oldJournal?.id, notes: input.notes?.trim(), attachment, edit_reason: note };
    expense.updated_at = new Date().toISOString();
    store.updateRow(expense);
    const document = store.listFinancialDocuments(tenant, { sourceId: expense.id }).find((entry) => entry.documentType === 'expense');
    if (document) store.appendFinancialDocument({ ...document, amountPaise: parseMoney(amount, 'expense amount'), status: expense.status, occurredAt: expense.updated_at, metadata: { ...(document.metadata || {}), paymentMode, journalId: journal.id, reason: note } });
    audit(tenant, actor, 'laundry:expense-edited', { entity: expense.entity, row_id: id, before, after: { ...presentExpense(expense, tenant), reason: note } });
    return presentExpense(expense, tenant);
  });
}

export function listLaundryExpenses(tenant: string, query: { search?: string; from?: string; to?: string } = {}) {
  const needle = String(query.search || '').trim().toLowerCase();
  return store.rowsOfReportDate(tenant, 'laundry_expense', 'expense_date', query.from, query.to)
    .map((expense) => presentExpense(expense, tenant))
    .filter((expense) => !needle || `${expense.expenseName} ${expense.paymentReceiver} ${expense.invoiceNumber}`.toLowerCase().includes(needle))
    .sort((a, b) => `${b.expenseDate}:${b.createdAt}`.localeCompare(`${a.expenseDate}:${a.createdAt}`));
}

export function laundryReports(tenant: string, from?: string, to?: string) {
  const orders = listLaundryOrders(tenant, { from, to });
  const activeOrders = orders.filter((order) => order.state !== 'Cancelled');
  const expenses = listLaundryExpenses(tenant, { from, to }).filter((expense) => expense.status !== 'Cancelled');
  const reportTo = to || orders[0]?.orderDate || today();
  const reportFrom = from || shiftDate(reportTo, -6);
  const orderValue = round(activeOrders.reduce((sum, order) => sum + order.grandTotal, 0));
  const collections = collectionsForOrders(tenant, orders, from, to);
  const collected = round(collections.reduce((sum, row) => sum + row.amount, 0));
  const expenseTotal = round(expenses.reduce((sum, expense) => sum + expense.amount, 0));
  return {
    range: { from: from || null, to: to || null },
    summary: { orderValue, collected, outstanding: round(orderValue - collected), expenses: expenseTotal, operatingCash: round(collected - expenseTotal), orders: orders.length, customers: new Set(orders.map((order) => order.customer.id || order.customer.phone)).size },
    stateBreakdown: LAUNDRY_STATES.map((state) => ({ state, count: orders.filter((order) => order.state === state).length, amount: round(orders.filter((order) => order.state === state).reduce((sum, order) => sum + order.grandTotal, 0)) })),
    paymentBreakdown: ['Pay Later', 'Cash', 'UPI', 'Card', 'Bank'].map((paymentMode) => ({ paymentMode, count: activeOrders.filter((order) => order.paymentMode === paymentMode).length, amount: round(activeOrders.filter((order) => order.paymentMode === paymentMode).reduce((sum, order) => sum + order.grandTotal, 0)) })),
    trend: dailySeries(orders, expenses, collections, reportFrom, reportTo),
    fulfillmentBreakdown: fulfillmentSeries(orders),
    topGarments: topItemSeries(orders, 'garmentName'),
    topServices: topItemSeries(orders, 'serviceName'),
  };
}

export type LaundryReportKind = 'invoice' | 'collection' | 'order' | 'consolidated-invoices' | 'customer' | 'customer-package' | 'customer-list' | 'growth' | 'discount' | 'expense' | 'balance' | 'pickup' | 'rider-delivery' | 'rider-collection' | 'warehouse-user-work';

/** Warehouse User Work is an activation-gated report in the audited reference. */
export function isLaundryReportLocked(kind: string): boolean {
  return kind === 'warehouse-user-work';
}

function laundryReportDayTitle(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
}

function normalizedFinancialAmount(tenant: string, documentType: string, source: EntityRow, fallback: unknown) {
  const amountPaise = store.financialDocumentAmountPaise(tenant, documentType, source.entity, source.id);
  return amountPaise === undefined ? Number(fallback || 0) : moneyNumber(amountPaise);
}

type LaundryBalanceRow = { customer: string; phone: string; customerKey: string; invoiceNumber: string; orderNumber: string; invoiceAmount: number; balanceAmount: number; date: string };

function laundryBalanceRows(tenant: string): LaundryBalanceRow[] {
  const orders = store.rowsOf(tenant, 'laundry_order').map((row) => presentOrder(tenant, row));
  const paymentsByInvoice = new Map<string, number>();
  for (const payment of store.rowsOf(tenant, 'payment_entry')) {
    if (payment.status !== 'Submitted' || payment.data.payment_type !== 'Receive') continue;
    const invoiceId = String(payment.data.against_sales || '');
    if (!invoiceId) continue;
    paymentsByInvoice.set(invoiceId, round((paymentsByInvoice.get(invoiceId) || 0) + normalizedFinancialAmount(tenant, 'payment', payment, payment.data.amount)));
  }

  const balances: LaundryBalanceRow[] = [];
  for (const order of orders) {
    if (order.state === 'Cancelled') continue;
    const raw = store.getRow(tenant, order.id);
    const invoiceId = String(raw?.data.invoice || '');
    const invoice = invoiceId ? store.getRow(tenant, invoiceId) : undefined;
    const invoiceAmount = invoice?.entity === 'sales_invoice' ? normalizedFinancialAmount(tenant, 'invoice', invoice, order.grandTotal) : order.grandTotal;
    const paidAmount = order.paymentStatus === 'Paid' ? invoiceAmount : Math.min(invoiceAmount, paymentsByInvoice.get(invoiceId) || 0);
    const balanceAmount = round(Math.max(0, invoiceAmount - paidAmount));
    if (balanceAmount <= 0) continue;
    balances.push({ customer: order.customer.name, phone: order.customer.phone, customerKey: order.customer.id || order.customer.phone || order.customer.name, invoiceNumber: String(order.invoiceNumber || ''), orderNumber: order.orderNumber, invoiceAmount, balanceAmount, date: order.orderDate });
  }

  for (const item of listPackageBalanceRows(tenant)) {
    const customer = store.getRow(tenant, item.customerId);
    const name = String(customer?.data.name || 'Unknown customer');
    const phone = String(customer?.data.phone || '');
    balances.push({ customer: name, phone, customerKey: item.customerId || phone || name, invoiceNumber: 'Package Payment', orderNumber: '-', invoiceAmount: item.invoiceAmount, balanceAmount: item.balanceAmount, date: item.date });
  }
  return balances;
}

export type LaundryStatisticsPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom' | 'lifetime';
export type LaundryStatisticsRange = { period?: LaundryStatisticsPeriod; from?: string; to?: string };
export type LaundryStatisticsFilters = Partial<Record<'ordersReview' | 'collection' | 'customerFrequency' | 'newCustomer', LaundryStatisticsRange>>;

function statisticsDates(from: string, to: string) {
  const dates: string[] = [];
  let cursor = from;
  for (let i = 0; i < 3661 && cursor <= to; i += 1) { dates.push(cursor); cursor = shiftDate(cursor, 1); }
  return dates;
}

function validStatisticsDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function laundryStatistics(tenant: string, input: LaundryStatisticsFilters | 'today' | 'week' | 'lifetime' = 'today') {
  const asOf = today();
  const allOrderRows = store.rowsOf(tenant, 'laundry_order');
  const orderDates = allOrderRows.map((row) => String(row.data.order_date || '')).filter(Boolean).sort();
  const legacy = typeof input === 'string' ? input : undefined;
  const filterSet = typeof input === 'string' ? {} : input;
  const defaults: Record<'ordersReview' | 'collection' | 'customerFrequency' | 'newCustomer', LaundryStatisticsPeriod> = {
    ordersReview: legacy || 'today', collection: legacy || 'week', customerFrequency: legacy || 'today', newCustomer: legacy || 'week',
  };
  const resolve = (key: keyof typeof defaults): { period: LaundryStatisticsPeriod; from: string; to: string } => {
    const requested = filterSet[key];
    const period = requested?.period || defaults[key];
    let from = asOf;
    let to = asOf;
    if (period === 'custom') {
      from = String(requested?.from || ''); to = String(requested?.to || '');
      if (!validStatisticsDate(from) || !validStatisticsDate(to) || from > to) throw new Error('Choose a valid custom start and end date.');
    } else if (period === 'yesterday') from = to = shiftDate(asOf, -1);
    else if (period === 'week') from = shiftDate(asOf, -6);
    else if (period === 'month') from = `${asOf.slice(0, 7)}-01`;
    else if (period === 'quarter') from = `${asOf.slice(0, 4)}-${String(Math.floor((Number(asOf.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
    else if (period === 'year') from = `${asOf.slice(0, 4)}-01-01`;
    else if (period === 'lifetime') from = orderDates[0] || asOf;
    else if (period !== 'today') throw new Error('Unknown statistics period.');
    return { period, from, to };
  };
  const ranges = {
    ordersReview: resolve('ordersReview'), collection: resolve('collection'),
    customerFrequency: resolve('customerFrequency'), newCustomer: resolve('newCustomer'),
  };
  const inRange = (value: unknown, range: { from: string; to: string }) => String(value || '') >= range.from && String(value || '') <= range.to;
  const orders = allOrderRows.filter((row) => inRange(row.data.order_date, ranges.ordersReview) && row.data.state !== 'Cancelled');
  // The overview intentionally keeps the four UniClean-style buckets while
  // aggregating Epic's more granular lifecycle states into those buckets.
  const orderStates = [
    { state: 'Booked', matches: ['Booked'] },
    { state: 'In Process', matches: ['Picked Up', 'In Process'] },
    { state: 'Delivered', matches: ['Delivered'] },
    { state: 'Done', matches: ['Ready', 'Out for Delivery'] },
  ].map(({ state, matches }) => ({ state, count: orders.filter((row) => matches.includes(String(row.data.state))).length }));
  const orderRangeDates = ranges.ordersReview.period === 'lifetime' ? [...new Set(orders.map((row) => String(row.data.order_date || '')))].sort() : statisticsDates(ranges.ordersReview.from, ranges.ordersReview.to);
  const collectionRangeDates = ranges.collection.period === 'lifetime'
    ? [...new Set(store.rowsOf(tenant, 'payment_entry').map((row) => String(row.data.posting_date || '')).filter((date) => date >= ranges.collection.from && date <= ranges.collection.to))].sort()
    : statisticsDates(ranges.collection.from, ranges.collection.to);
  const payments = store.rowsOf(tenant, 'payment_entry').filter((row) => row.status === 'Submitted' && row.data.payment_type === 'Receive' && inRange(row.data.posting_date, ranges.collection));
  const collectionDaily = collectionRangeDates.map((date) => ({ date, amount: round(payments.filter((row) => row.data.posting_date === date).reduce((sum, row) => sum + normalizedFinancialAmount(tenant, 'payment', row, row.data.amount), 0)) }));
  const orderAmount = (row: EntityRow) => {
    const invoice = store.getRow(tenant, row.data.invoice);
    return invoice?.entity === 'sales_invoice' ? normalizedFinancialAmount(tenant, 'invoice', invoice, row.data.grand_total) : Number(row.data.grand_total || 0);
  };
  const orderDaily = orderRangeDates.map((date) => {
    const dayOrders = orders.filter((row) => String(row.data.order_date || '') === date);
    return { date, orders: dayOrders.length, amount: round(dayOrders.reduce((sum, row) => sum + orderAmount(row), 0)) };
  });
  const frequencyOrders = allOrderRows.filter((row) => inRange(row.data.order_date, ranges.customerFrequency) && row.data.state !== 'Cancelled');
  const customerIds = frequencyOrders.map((row) => String(row.data.customer || '')).filter(Boolean);
  const frequency = [...new Set(customerIds)].map((customerId) => {
    const customer = store.getRow(tenant, customerId);
    return { customer: String(customer?.data.name || customer?.data.display_name || customerId), visits: customerIds.filter((id) => id === customerId).length };
  }).sort((a, b) => b.visits - a.visits);
  const newCustomers = store.rowsOf(tenant, 'party').filter((row) => row.data.is_customer && inRange(row.created_at.slice(0, 10), ranges.newCustomer));
  const newCustomerDates = ranges.newCustomer.period === 'lifetime' ? [...new Set(newCustomers.map((row) => row.created_at.slice(0, 10)))].sort() : statisticsDates(ranges.newCustomer.from, ranges.newCustomer.to);
  const newCustomerDaily = newCustomerDates.map((date) => ({ date, count: newCustomers.filter((row) => row.created_at.slice(0, 10) === date).length }));
  const serviceMap = orders.flatMap((row) => (Array.isArray(row.data.items) ? row.data.items : []) as Array<Record<string, unknown>>).reduce((rows, item) => {
    const name = String(item.serviceName || 'Other');
    const current = rows.get(name) || { service: name, quantity: 0, amount: 0 };
    current.quantity += Number(item.qty || 0);
    current.amount = round(current.amount + Number(item.amount || 0));
    rows.set(name, current);
    return rows;
  }, new Map<string, { service: string; quantity: number; amount: number }>());
  const serviceMix = [...serviceMap.values()].sort((a, b) => b.amount - a.amount);
  const orderValue = round(orders.reduce((sum, row) => sum + orderAmount(row), 0));
  const collectionTotal = round(payments.reduce((sum, row) => sum + normalizedFinancialAmount(tenant, 'payment', row, row.data.amount), 0));
  const repeatCustomers = frequency.filter((row) => row.visits > 1).length;
  const onlineOrders = store.listMarketplaceOrderProjections(tenant).filter((order) => {
    if (MARKETPLACE_TERMINAL_EXCLUDED.includes(order.state)) return false;
    const createdOn = String(order.createdAt || '').slice(0, 10);
    return createdOn >= ranges.ordersReview.from && createdOn <= ranges.ordersReview.to;
  });
  const online = {
    count: onlineOrders.length,
    estimatedRevenue: round(onlineOrders.reduce((sum, order) => sum + (Number((order.request as Record<string, unknown> | undefined)?.payableAmountPaise) || 0) / 100, 0)),
    topGarments: marketplaceTopGarments(onlineOrders),
  };
  return {
    period: ranges.ordersReview.period, from: ranges.ordersReview.from, to: ranges.ordersReview.to, ranges,
    ordersReview: { total: orders.length, breakdown: orderStates, daily: orderDaily },
    revenue: { total: orderValue, averageOrderValue: orders.length ? round(orderValue / orders.length) : 0 },
    collection: { total: collectionTotal, daily: collectionDaily },
    customerFrequency: { total: frequency.length, repeatCustomers, breakdown: frequency },
    newCustomer: { total: newCustomers.length, daily: newCustomerDaily }, serviceMix, online,
  };
}

export function laundryReportDetail(tenant: string, kind: LaundryReportKind, from?: string, to?: string, search?: string, paymentMethod?: string, page = 1, pageSize = 100, rowCap?: number, includeAll = false, collectionView: 'invoice' | 'customer' = 'invoice', orderView: 'service' | 'invoice' = 'service', balanceView: 'invoice' | 'customer' = 'invoice') {
  const reportKinds: LaundryReportKind[] = ['invoice', 'collection', 'order', 'consolidated-invoices', 'customer', 'customer-package', 'customer-list', 'growth', 'discount', 'expense', 'balance', 'pickup', 'rider-delivery', 'rider-collection', 'warehouse-user-work'];
  if (!reportKinds.includes(kind)) throw new Error('unknown laundry report');
  const needle = String(search || '').trim().toLowerCase();
  const paymentNeedle = String(paymentMethod || '').trim().toLowerCase();
  const inRange = (value: unknown) => (!from || String(value || '') >= from) && (!to || String(value || '') <= to);
  const reportOrders = store.rowsOfReportDate(tenant, 'laundry_order', 'order_date', from, to).map((row) => presentOrder(tenant, row));
  const collectionOrdersByInvoice = new Map<string, ReturnType<typeof presentOrder>>();
  const collectionOrdersById = new Map<string, ReturnType<typeof presentOrder>>();
  if (kind === 'collection') {
    for (const row of store.rowsOf(tenant, 'laundry_order')) {
      const order = presentOrder(tenant, row);
      collectionOrdersById.set(order.id, order);
      const invoiceId = String(row.data.invoice || '');
      if (invoiceId) collectionOrdersByInvoice.set(invoiceId, order);
    }
  }
  const orders = reportOrders.filter((row) => !needle || `${row.orderNumber} ${row.invoiceNumber || ''} ${row.customer.name} ${row.customer.phone}`.toLowerCase().includes(needle));
  const rows = (() => {
    if (kind === 'invoice') return orders.map((order) => ({ invoiceNumber: order.invoiceNumber || '', amount: order.grandTotal, status: order.state, tax: Number((store.getRow(tenant, order.id)?.data.tax_amount) || 0) }));
    if (kind === 'consolidated-invoices') return orders.map((order) => ({ invoiceNumber: order.invoiceNumber || '', orderNumber: order.orderNumber, customer: order.customer.name, date: order.orderDate, amount: order.grandTotal, status: order.state, tax: Number((store.getRow(tenant, order.id)?.data.tax_amount) || 0) }));
    if (kind === 'order' && orderView === 'invoice') return orders.map((order) => ({ orderDate: order.orderDate, customerName: order.customer.name, orderNumber: order.orderNumber, invoiceNumber: order.invoiceNumber || '', totalGarments: order.items.reduce((sum, item) => sum + item.qty, 0), garmentSummary: [...new Map(order.items.map((item) => [item.garmentName, order.items.filter((candidate) => candidate.garmentName === item.garmentName).reduce((sum, candidate) => sum + candidate.qty, 0)])).entries()].map(([name, quantity]) => `${name} (${quantity})`).join(' ') }));
    if (kind === 'order') { const grouped = new Map<string, { serviceName: string; totalGarments: number; garments: Map<string, number> }>(); for (const order of orders) for (const item of order.items) { const key = item.serviceName; const value = grouped.get(key) || { serviceName: key, totalGarments: 0, garments: new Map<string, number>() }; value.totalGarments += item.qty; value.garments.set(item.garmentName, (value.garments.get(item.garmentName) || 0) + item.qty); grouped.set(key, value); } return [...grouped.values()].map((row) => ({ serviceName: row.serviceName, totalGarments: row.totalGarments, garmentSummary: [...row.garments].map(([name, quantity]) => `${name} (${quantity})`).join(' ') })); }
    if (kind === 'discount') {
      const discountOrders = orders.filter((order) => order.state !== 'Cancelled');
      if (needle && discountOrders.length === 0) return [];
      const reportDates = from && to
        ? dateList(from, to)
        : [...new Set(discountOrders.map((order) => order.orderDate))].sort();
      return reportDates.map((date) => {
        const dayOrders = discountOrders.filter((order) => order.orderDate === date);
        const totalAmount = round(dayOrders.reduce((sum, order) => sum + order.grandTotal, 0));
        const discount = round(dayOrders.reduce((sum, order) => sum + Number(store.getRow(tenant, order.id)?.data.discounts || 0), 0));
        return {
          title: laundryReportDayTitle(date),
          totalAmount,
          discountAmount: discount,
          amountWithoutDiscount: round(totalAmount + discount),
        };
      });
    }
    if (kind === 'balance') {
      const balances = laundryBalanceRows(tenant).filter((row) => balanceView === 'customer'
        ? (!needle || `${row.customer} ${row.phone}`.toLowerCase().includes(needle))
        : (!needle || `${row.customer} ${row.phone} ${row.invoiceNumber} ${row.orderNumber}`.toLowerCase().includes(needle)));
      if (balanceView !== 'customer') return balances.map(({ customer: customerName, phone, invoiceNumber, orderNumber, invoiceAmount, balanceAmount }) => ({ customer: customerName, phone, invoiceNumber, orderNumber, invoiceAmount, balanceAmount }));
      const grouped = new Map<string, { customer: string; phone: string; invoiceAmount: number; balanceAmount: number }>();
      for (const row of balances) {
        const current = grouped.get(row.customerKey) || { customer: row.customer, phone: row.phone, invoiceAmount: 0, balanceAmount: 0 };
        current.invoiceAmount = round(current.invoiceAmount + row.invoiceAmount);
        current.balanceAmount = round(current.balanceAmount + row.balanceAmount);
        grouped.set(row.customerKey, current);
      }
      return [...grouped.values()];
    }
    if (kind === 'pickup') return orders.filter((order) => order.fulfillmentMode === 'Pickup Order').map((order) => ({ orderNumber: order.orderNumber, customer: order.customer.name, phone: order.customer.phone, date: order.orderDate, due: order.expectedDeliveryDate, state: order.state, rider: order.pickupRider?.name || '' }));
    if (kind === 'rider-delivery') return orders.filter((order) => order.fulfillmentMode !== 'Pickup Order').map((order) => ({ orderNumber: order.orderNumber, customer: order.customer.name, date: order.orderDate, due: order.expectedDeliveryDate, state: order.state, rider: order.deliveryRider?.name || '' }));
    if (kind === 'collection') {
      const receipts = store.rowsOfReportDate(tenant, 'payment_entry', 'posting_date', from, to).filter((row) => row.status === 'Submitted' && row.data.payment_type === 'Receive' && (!paymentNeedle || String(row.data.mode || 'Cash').toLowerCase() === paymentNeedle)).flatMap((row) => {
        const invoice = store.getRow(tenant, String(row.data.against_sales || ''));
        const linkedOrderId = String(invoice?.data.laundry_order || '');
        const order = invoice ? collectionOrdersByInvoice.get(invoice.id) || (linkedOrderId ? collectionOrdersById.get(linkedOrderId) : undefined) : undefined;
        const invoiceNumber = String(order?.invoiceNumber || invoice?.data.name || '');
        const orderNumber = order?.orderNumber || '';
        const reference = String(row.data.reference || '');
        const customerName = order?.customer.name || '';
        const phone = order?.customer.phone || '';
        const searchable = `${invoiceNumber} ${orderNumber} ${customerName} ${phone} ${reference}`.toLowerCase();
        if (collectionView === 'customer' ? (needle && !`${customerName} ${phone}`.toLowerCase().includes(needle)) : (needle && !searchable.includes(needle))) return [];
        return [{ invoiceNumber, orderNumber, customerName, phone, customerKey: order?.customer.id || phone || invoiceNumber || orderNumber || reference, amount: normalizedFinancialAmount(tenant, 'payment', row, row.data.amount), method: row.data.mode || 'Cash', date: row.data.posting_date, reference }];
      });
      if (collectionView !== 'customer') return receipts.map(({ customerName: _customerName, phone: _phone, customerKey: _customerKey, ...receipt }) => receipt);
      const customers = new Map<string, { customerName: string; phone: string; invoiceNumbers: Set<string>; paidAmount: number }>();
      for (const receipt of receipts) {
        const customerName = receipt.customerName || 'Unassigned customer';
        const key = receipt.customerKey || receipt.invoiceNumber || receipt.orderNumber || receipt.reference || `${receipt.date}:${receipt.amount}`;
        const customer = customers.get(key) || { customerName, phone: receipt.phone, invoiceNumbers: new Set<string>(), paidAmount: 0 };
        customer.invoiceNumbers.add(receipt.invoiceNumber || receipt.orderNumber || receipt.reference || key);
        customer.paidAmount += receipt.amount;
        customers.set(key, customer);
      }
      return [...customers.values()].map((customer) => ({ customerName: customer.customerName, phone: customer.phone, paidInvoices: customer.invoiceNumbers.size, paidAmount: Math.round(customer.paidAmount * 100) / 100 }));
    }
    if (kind === 'rider-collection') return listLaundryRiderSettlements(tenant, { from, to }).map((row) => ({ date: row.date, rider: row.rider, amount: row.amount, method: row.method, status: row.status, reference: row.reference }));
    if (kind === 'expense') {
      const expenses = listLaundryExpenses(tenant, { from, to, search: needle });
      if (needle && expenses.length === 0) return [];
      const byDate = new Map<string, { expenseAmount: number; taxAmount: number; taxKnown: boolean; count: number }>();
      for (const expense of expenses) {
        const values = byDate.get(expense.expenseDate) || { expenseAmount: 0, taxAmount: 0, taxKnown: true, count: 0 };
        values.expenseAmount += expense.amount;
        values.count += 1;
        const tax = store.getRow(tenant, expense.id)?.data.tax_amount;
        if (tax === undefined || tax === null || !Number.isFinite(Number(tax))) values.taxKnown = false;
        else values.taxAmount += Number(tax);
        byDate.set(expense.expenseDate, values);
      }
      const reportDates = from && to ? dateList(from, to) : [...new Set(expenses.map((expense) => expense.expenseDate))].sort();
      return reportDates.map((date) => {
        const values = byDate.get(date);
        const expenseAmount = round(values?.expenseAmount || 0);
        const taxAmount = values?.count ? values.taxKnown ? round(values.taxAmount) : null : 0;
        return { title: laundryReportDayTitle(date), expenseAmount, taxAmount, amountBeforeTax: taxAmount === null ? null : round(expenseAmount - taxAmount) };
      });
    }
    if (kind === 'customer-list') return store.rowsOfReportDate(tenant, 'party', 'created_at', from ? `${from}T00:00:00.000Z` : undefined, to ? `${to}T23:59:59.999Z` : undefined)
      .filter((row) => row.data.is_customer && (!needle || `${row.data.name} ${row.data.phone}`.toLowerCase().includes(needle)))
      .map((row) => ({ customer: row.data.name, phone: row.data.phone }));
    if (kind === 'customer') {
      const grouped = new Map<string, { customer: string; phone: string; revenue: number; revenueWithoutTax: number; visits: number; lastVisitedDate: string }>();
      for (const order of orders) {
        if (order.state === 'Cancelled') continue;
        const key = order.customer.id || order.customer.phone || order.customer.name;
        const value = grouped.get(key) || { customer: order.customer.name, phone: order.customer.phone, revenue: 0, revenueWithoutTax: 0, visits: 0, lastVisitedDate: order.orderDate };
        const tax = Math.max(0, Number(store.getRow(tenant, order.id)?.data.tax_amount || 0));
        value.revenue += order.grandTotal;
        value.revenueWithoutTax += Math.max(0, order.grandTotal - tax);
        value.visits += 1;
        if (order.orderDate > value.lastVisitedDate) value.lastVisitedDate = order.orderDate;
        grouped.set(key, value);
      }
      const asOf = to || today();
      const daysBetween = (later: string, earlier: string) => Math.max(0, Math.floor((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000));
      return [...grouped.values()].map((row) => ({
        ...row,
        revenue: Math.round(row.revenue * 100) / 100,
        revenueWithoutTax: Math.round(row.revenueWithoutTax * 100) / 100,
        daysSinceVisit: daysBetween(asOf, row.lastVisitedDate),
        reviews: '',
      }));
    }
    if (kind === 'customer-package') return store.rowsOfReportDate(tenant, 'customer_package', 'purchased_date', from, to)
      .filter((row) => row.status !== 'Cancelled' && row.data.status !== 'Cancelled')
      .map((row) => {
        const customer = store.getRow(tenant, String(row.data.customer));
        const definition = store.getRow(tenant, String(row.data.service_package));
        return {
          customer: customer?.data.name || '',
          packageName: definition?.data.name || 'Package unavailable',
          packageAmount: Number(row.data.contract_price ?? definition?.data.price ?? 0),
          status: row.data.status || '',
          assigned: row.data.purchased_date || row.created_at.slice(0, 10),
          expires: row.data.expires_on || '',
        };
      })
      .filter((row) => !needle || `${row.customer} ${row.packageName} ${row.status}`.toLowerCase().includes(needle));
    if (kind === 'warehouse-user-work') return store.rowsOf(tenant, 'laundry_fulfillment_event').filter((row) => inRange(row.data.event_date)).map((row) => ({ date: row.data.event_date, actor: row.created_by, order: row.data.order, stage: row.data.stage, quantity: row.data.quantity, unit: row.data.unit }));
    if (kind === 'growth') {
      const activeOrders = orders.filter((order) => order.state !== 'Cancelled');
      if (needle && activeOrders.length === 0) return [];
      const total = round(activeOrders.reduce((sum, order) => sum + order.grandTotal, 0));
      const tax = round(activeOrders.reduce((sum, order) => sum + Number(store.getRow(tenant, order.id)?.data.tax_amount || 0), 0));
      return [{ total, tax, amountWithoutTax: round(total - tax) }];
    }
    const summary = laundryReports(tenant, from, to).summary;
    const activeTax = orders
      .filter((order) => order.state !== 'Cancelled')
      .reduce((sum, order) => sum + Number(store.getRow(tenant, order.id)?.data.tax_amount || 0), 0);
    return [{ title: kind === 'growth' ? 'Growth' : 'Expense', total: summary.orderValue, tax: activeTax, amountWithoutTax: summary.orderValue - activeTax }];
  })();
  const boundedCap = rowCap === undefined ? undefined : Math.max(1, Math.min(5000, Math.floor(Number(rowCap) || 5000)));
  const totalRows = rows.length;
  const cappedRows = boundedCap === undefined ? rows : rows.slice(0, boundedCap);
  const availableRows = boundedCap === undefined ? totalRows : Math.min(totalRows, boundedCap);
  const boundedPageSize = includeAll ? Math.max(1, availableRows) : Math.max(1, Math.min(boundedCap ?? 500, Math.floor(Number(pageSize) || 100)));
  const totalPages = Math.max(1, Math.ceil(availableRows / boundedPageSize));
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(Number(page) || 1)));
  const offset = (safePage - 1) * boundedPageSize;
  const emptyColumns = kind === 'collection' ? (collectionView === 'customer' ? ['customerName', 'phone', 'paidInvoices', 'paidAmount'] : ['invoiceNumber', 'orderNumber', 'amount', 'method', 'date', 'reference']) : [];
  const summary = kind === 'invoice' ? { label: 'Total Invoice Amount', value: rows.reduce((sum, row) => sum + (Number((row as Record<string, unknown>).amount) || 0), 0), format: 'currency' as const } : kind === 'order' ? { label: 'Total Garment Count', value: rows.reduce((sum, row) => sum + (Number((row as Record<string, unknown>).totalGarments) || 0), 0), format: 'count' as const } : kind === 'customer' ? { label: 'Total Revenue', value: rows.reduce((sum, row) => sum + (Number((row as Record<string, unknown>).revenue) || 0), 0), format: 'currency' as const } : kind === 'customer-package' ? { label: 'Total Package Amount', value: rows.reduce((sum, row) => sum + (Number((row as Record<string, unknown>).packageAmount) || 0), 0), format: 'currency' as const } : kind === 'discount' ? { label: 'Total Discount Amount', value: rows.reduce((sum, row) => sum + (Number((row as Record<string, unknown>).discountAmount) || 0), 0), format: 'currency' as const } : kind === 'expense' ? { label: 'Total Expense', value: rows.reduce((sum, row) => sum + (Number((row as Record<string, unknown>).expenseAmount) || 0), 0), format: 'currency' as const } : kind === 'balance' ? { label: 'Total Balance Amount', value: rows.reduce((sum, row) => sum + (Number((row as Record<string, unknown>).balanceAmount) || 0), 0), format: 'currency' as const } : undefined;
  const noDataColumns = kind === 'invoice' ? ['invoiceNumber', 'amount', 'status', 'tax'] : kind === 'order' ? orderView === 'invoice' ? ['orderDate', 'customerName', 'orderNumber', 'invoiceNumber', 'totalGarments', 'garmentSummary'] : ['serviceName', 'totalGarments', 'garmentSummary'] : kind === 'customer' ? ['customer', 'phone', 'revenue', 'revenueWithoutTax', 'visits', 'lastVisitedDate', 'daysSinceVisit', 'reviews'] : kind === 'customer-package' ? ['customer', 'packageName', 'packageAmount', 'status', 'assigned', 'expires'] : kind === 'customer-list' ? ['customer', 'phone'] : kind === 'growth' ? ['total', 'tax', 'amountWithoutTax'] : kind === 'discount' ? ['title', 'totalAmount', 'discountAmount', 'amountWithoutDiscount'] : kind === 'expense' ? ['title', 'expenseAmount', 'taxAmount', 'amountBeforeTax'] : kind === 'balance' ? balanceView === 'customer' ? ['customer', 'phone', 'invoiceAmount', 'balanceAmount'] : ['customer', 'phone', 'invoiceNumber', 'orderNumber', 'invoiceAmount', 'balanceAmount'] : emptyColumns;
  return { kind, from: kind === 'balance' ? null : from || null, to: kind === 'balance' ? null : to || null, columns: totalRows ? Object.keys(rows[0]) : noDataColumns, rows: cappedRows.slice(offset, offset + boundedPageSize), totalRows, page: safePage, pageSize: boundedPageSize, totalPages, exportCap: boundedCap ?? null, exportTruncated: boundedCap !== undefined && totalRows > boundedCap, ...(summary ? { summary } : {}) };
}

export function laundryReportChart(tenant: string, kind: LaundryReportKind, from?: string, to?: string, paymentMethod?: string) {
  const end = to || today();
  const start = from || shiftDate(end, -6);
  if (start > end) throw new Error('chart start date must not be after end date');
  if (kind === 'balance') {
    const byDate = new Map<string, number>();
    for (const row of laundryBalanceRows(tenant)) {
      if (row.date < start || row.date > end) continue;
      byDate.set(row.date, round((byDate.get(row.date) || 0) + row.balanceAmount));
    }
    return { kind, from: start, to: end, metric: 'Balance amount', points: dateList(start, end).map((date) => ({ label: date, value: byDate.get(date) || 0 })) };
  }
  const detail = laundryReportDetail(tenant, kind, start, end, undefined, paymentMethod, 1, 100, undefined, true);
  const rows = detail.rows as Array<Record<string, unknown>>;

  if (kind === 'growth' || kind === 'expense') {
    const series = laundryReports(tenant, start, end).trend;
    return {
      kind, from: start, to: end,
      metric: kind === 'growth' ? 'Order value' : 'Expenses',
      points: series.map((point) => ({ label: point.date, value: kind === 'growth' ? point.orderValue : point.expenses })),
    };
  }

  if (kind === 'order') {
    const byService = new Map<string, number>();
    for (const order of listLaundryOrders(tenant, { from: start, to: end })) for (const item of order.items) byService.set(item.serviceName, round((byService.get(item.serviceName) || 0) + item.amount));
    return { kind, from: start, to: end, metric: 'Service amount', points: [...byService].map(([label, value]) => ({ label, value })) };
  }

  if (kind === 'invoice') {
    const byDate = new Map<string, number>();
    for (const order of listLaundryOrders(tenant, { from: start, to: end })) byDate.set(order.orderDate, round((byDate.get(order.orderDate) || 0) + order.grandTotal));
    return { kind, from: start, to: end, metric: 'Invoice amount', points: dateList(start, end).map((date) => ({ label: date, value: byDate.get(date) || 0 })) };
  }

  if (kind === 'discount') {
    const byDate = new Map<string, number>();
    for (const order of listLaundryOrders(tenant, { from: start, to: end })) {
      if (order.state === 'Cancelled') continue;
      byDate.set(order.orderDate, round((byDate.get(order.orderDate) || 0) + order.discounts));
    }
    return { kind, from: start, to: end, metric: 'Discount amount', points: dateList(start, end).map((date) => ({ label: date, value: byDate.get(date) || 0 })) };
  }

  if (kind === 'customer') {
    const byDate = new Map<string, number>();
    for (const order of listLaundryOrders(tenant, { from: start, to: end })) {
      if (order.state === 'Cancelled') continue;
      byDate.set(order.orderDate, round((byDate.get(order.orderDate) || 0) + order.grandTotal));
    }
    return { kind, from: start, to: end, metric: 'Customer revenue', points: dateList(start, end).map((date) => ({ label: date, value: byDate.get(date) || 0 })) };
  }

  if (kind === 'customer-list') {
    const byCreatedDate = new Map<string, number>();
    for (const row of store.rowsOfReportDate(tenant, 'party', 'created_at', `${start}T00:00:00.000Z`, `${end}T23:59:59.999Z`)) {
      if (!row.data.is_customer) continue;
      const date = row.created_at.slice(0, 10);
      byCreatedDate.set(date, (byCreatedDate.get(date) || 0) + 1);
    }
    return { kind, from: start, to: end, metric: 'New customers', points: dateList(start, end).map((date) => ({ label: date, value: byCreatedDate.get(date) || 0 })) };
  }

  const dateKey = ['date', 'postingDate', 'lastVisitedDate', 'lastVisit', 'assigned', 'expires', 'eventDate'].find((key) => detail.columns.includes(key));
  const metricKey = ['amount', 'revenue', 'total', 'discount', 'quantity', 'tax'].find((key) => rows.some((row) => Number.isFinite(Number(row[key]))));
  const valueFor = (row: Record<string, unknown>) => metricKey ? Number(row[metricKey]) || 0 : 1;

  if (dateKey) {
    const byDate = new Map<string, number>();
    for (const row of rows) {
      const label = String(row[dateKey] || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(label) || label < start || label > end) continue;
      byDate.set(label, (byDate.get(label) || 0) + valueFor(row));
    }
    const dates = dateList(start, end);
    const labels = dates.length && dates[dates.length - 1] === end ? dates : [...byDate.keys()].sort();
    return {
      kind, from: start, to: end,
      metric: metricKey ? metricKey.replace(/([A-Z])/g, ' $1') : 'Records',
      points: labels.map((label) => ({ label, value: byDate.get(label) || 0 })),
    };
  }

  const categoryKey = ['service', 'stage', 'status', 'package', 'title'].find((key) => detail.columns.includes(key));
  if (categoryKey) {
    const byCategory = new Map<string, number>();
    for (const row of rows) {
      const label = String(row[categoryKey] || 'Other');
      byCategory.set(label, (byCategory.get(label) || 0) + valueFor(row));
    }
    return { kind, from: start, to: end, metric: metricKey ? metricKey.replace(/([A-Z])/g, ' $1') : 'Records', points: [...byCategory].map(([label, value]) => ({ label, value })) };
  }

  return { kind, from: start, to: end, metric: 'Records', points: [] as Array<{ label: string; value: number }> };
}

/**
 * Cursor-backed rows for exports whose result is one record per source row.
 * Aggregate reports intentionally continue through laundryReportDetail because
 * they require grouping/reconciliation. The iterator keeps source rows out of
 * the worker heap and lets the CSV writer flush bounded batches.
 */
export function laundryReportDetailStream(tenant: string, kind: LaundryReportKind, from?: string, to?: string, search?: string): { columns: string[]; rows: Iterable<Record<string, unknown>> } | undefined {
  const needle = String(search || '').trim().toLowerCase();
  const streamable = new Set<LaundryReportKind>(['invoice', 'consolidated-invoices', 'pickup', 'rider-delivery', 'customer-list', 'customer-package']);
  if (!streamable.has(kind)) return undefined;
  const orderRows = function* () {
    for (const raw of store.iterateRowsOfReportDate(tenant, 'laundry_order', 'order_date', from, to)) {
      const order = presentOrder(tenant, raw);
      if (!needle || `${order.orderNumber} ${order.invoiceNumber || ''} ${order.customer.name} ${order.customer.phone}`.toLowerCase().includes(needle)) yield order;
    }
  };
  if (kind === 'invoice') return { columns: ['invoiceNumber', 'amount', 'status', 'tax'], rows: (function* () { for (const order of orderRows()) yield { invoiceNumber: order.invoiceNumber || '', amount: order.grandTotal, status: order.state, tax: Number(store.getRow(tenant, order.id)?.data.tax_amount || 0) }; })() };
  if (kind === 'consolidated-invoices') return { columns: ['invoiceNumber', 'orderNumber', 'customer', 'date', 'amount', 'status', 'tax'], rows: (function* () { for (const order of orderRows()) yield { invoiceNumber: order.invoiceNumber || '', orderNumber: order.orderNumber, customer: order.customer.name, date: order.orderDate, amount: order.grandTotal, status: order.state, tax: Number(store.getRow(tenant, order.id)?.data.tax_amount || 0) }; })() };
  if (kind === 'pickup') return { columns: ['orderNumber', 'customer', 'phone', 'date', 'due', 'state', 'rider'], rows: (function* () { for (const order of orderRows()) if (order.fulfillmentMode === 'Pickup Order') yield { orderNumber: order.orderNumber, customer: order.customer.name, phone: order.customer.phone, date: order.orderDate, due: order.expectedDeliveryDate, state: order.state, rider: order.pickupRider?.name || '' }; })() };
  if (kind === 'rider-delivery') return { columns: ['orderNumber', 'customer', 'date', 'due', 'state', 'rider'], rows: (function* () { for (const order of orderRows()) if (order.fulfillmentMode !== 'Pickup Order') yield { orderNumber: order.orderNumber, customer: order.customer.name, date: order.orderDate, due: order.expectedDeliveryDate, state: order.state, rider: order.deliveryRider?.name || '' }; })() };
  if (kind === 'customer-list') return { columns: ['customer', 'phone'], rows: (function* () { for (const row of store.iterateRowsOfReportDate(tenant, 'party', 'created_at', from ? `${from}T00:00:00.000Z` : undefined, to ? `${to}T23:59:59.999Z` : undefined)) if (row.data.is_customer && (!needle || `${row.data.name} ${row.data.phone}`.toLowerCase().includes(needle))) yield { customer: row.data.name, phone: row.data.phone }; })() };
  return { columns: ['customer', 'packageName', 'packageAmount', 'status', 'assigned', 'expires'], rows: (function* () {
    for (const row of store.iterateRowsOfReportDate(tenant, 'customer_package', 'purchased_date', from, to)) {
      if (row.status === 'Cancelled' || row.data.status === 'Cancelled') continue;
      const customer = store.getRow(tenant, String(row.data.customer));
      const definition = store.getRow(tenant, String(row.data.service_package));
      const reportRow = { customer: customer?.data.name || '', packageName: definition?.data.name || 'Package unavailable', packageAmount: Number(row.data.contract_price ?? definition?.data.price ?? 0), status: row.data.status || '', assigned: row.data.purchased_date || row.created_at.slice(0, 10), expires: row.data.expires_on || '' };
      if (!needle || `${reportRow.customer} ${reportRow.packageName} ${reportRow.status}`.toLowerCase().includes(needle)) yield reportRow;
    }
  })() };
}

type TrendPoint = { date: string; orders: number; orderValue: number; collected: number; expenses: number };
type RankedItem = { name: string; quantity: number; amount: number };
type CollectionPoint = { date: string; amount: number };

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateList(from: string, to: string) {
  const dates: string[] = [];
  let cursor = from;
  for (let i = 0; i < 366 && cursor <= to; i += 1) {
    dates.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return dates;
}

function dailySeries(orders: ReturnType<typeof listLaundryOrders>, expenses: ReturnType<typeof listLaundryExpenses>, collections: CollectionPoint[], from: string, to: string): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>(dateList(from, to).map((date) => [date, { date, orders: 0, orderValue: 0, collected: 0, expenses: 0 }]));
  orders.forEach((order) => {
    const point = byDate.get(order.orderDate);
    if (!point) return;
    point.orders += 1;
    if (order.state !== 'Cancelled') point.orderValue = round(point.orderValue + order.grandTotal);
  });
  collections.forEach((collection) => { const point = byDate.get(collection.date); if (point) point.collected = round(point.collected + collection.amount); });
  expenses.forEach((expense) => {
    const point = byDate.get(expense.expenseDate);
    if (point) point.expenses = round(point.expenses + expense.amount);
  });
  return [...byDate.values()];
}

function collectionsForOrders(tenant: string, orders: ReturnType<typeof listLaundryOrders>, from?: string, to?: string): CollectionPoint[] {
  const invoiceIds = new Set(orders.map((order) => String(store.getRow(tenant, order.id)?.data.invoice || '')).filter(Boolean));
  return store.rowsOf(tenant, 'payment_entry')
    .filter((row) => row.status === 'Submitted' && row.data.payment_type === 'Receive' && invoiceIds.has(String(row.data.against_sales || '')))
    .filter((row) => !from || String(row.data.posting_date || '') >= from)
    .filter((row) => !to || String(row.data.posting_date || '') <= to)
    .map((row) => ({ date: String(row.data.posting_date || ''), amount: round(normalizedFinancialAmount(tenant, 'payment', row, row.data.amount)) }))
    .filter((row) => Boolean(row.date));
}

function fulfillmentSeries(orders: ReturnType<typeof listLaundryOrders>) {
  const byMode = new Map<string, { mode: string; count: number; amount: number }>();
  orders.forEach((order) => {
    const mode = order.fulfillmentMode || 'Pickup Order';
    const point = byMode.get(mode) || { mode, count: 0, amount: 0 };
    point.count += 1;
    if (order.state !== 'Cancelled') point.amount = round(point.amount + order.grandTotal);
    byMode.set(mode, point);
  });
  return [...byMode.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
}

function topItemSeries(orders: ReturnType<typeof listLaundryOrders>, key: 'garmentName' | 'serviceName'): RankedItem[] {
  const byName = new Map<string, RankedItem>();
  orders.filter((order) => order.state !== 'Cancelled').forEach((order) => order.items.forEach((item) => {
    const name = String(item[key] || 'Unlabelled');
    const point = byName.get(name) || { name, quantity: 0, amount: 0 };
    point.quantity += Number(item.qty) || 0;
    point.amount = round(point.amount + (Number(item.amount) || 0));
    byName.set(name, point);
  }));
  return [...byName.values()].sort((a, b) => b.amount - a.amount || b.quantity - a.quantity).slice(0, 6);
}

const MARKETPLACE_TERMINAL_EXCLUDED = ['Cancelled', 'Rejected', 'Expired'];

// A separate top-garments tally for real online (marketplace-pulled) orders —
// deliberately never merged with topItemSeries' local-counter figure. These
// orders may still be pre-intake (garmentId/serviceId not yet resolved
// against the local catalogue), so this reads straight from each order's own
// raw request payload rather than requiring intake first.
function marketplaceTopGarments(orders: ReturnType<typeof store.listMarketplaceOrderProjections>): RankedItem[] {
  const byName = new Map<string, RankedItem>();
  for (const order of orders) {
    if (MARKETPLACE_TERMINAL_EXCLUDED.includes(order.state)) continue;
    const items = Array.isArray((order.request as Record<string, unknown> | undefined)?.items) ? (order.request as Record<string, unknown>).items as Array<Record<string, unknown>> : [];
    for (const item of items) {
      const name = String(item.name || 'Unlabelled');
      const point = byName.get(name) || { name, quantity: 0, amount: 0 };
      point.quantity += Number(item.quantity) || 0;
      point.amount = round(point.amount + (Number(item.total_paise) || 0) / 100);
      byName.set(name, point);
    }
  }
  return [...byName.values()].sort((a, b) => b.amount - a.amount || b.quantity - a.quantity).slice(0, 6);
}

export function receiptFor(tenant: string, order: EntityRow) {
  const display = presentOrder(tenant, order);
  return {
    orderNumber: display.orderNumber,
    invoiceNumber: display.invoiceNumber,
    customer: display.customer,
    orderDate: display.orderDate,
    expectedDeliveryDate: display.expectedDeliveryDate,
    fulfillmentMode: display.fulfillmentMode,
    items: display.items,
    subtotal: Number(order.data.subtotal || 0),
    charges: Number(order.data.charges || 0),
    discounts: Number(order.data.discounts || 0),
    taxAmount: Number(order.data.tax_amount || 0),
    breakdown: display.breakdown,
    grandTotal: Number(order.data.grand_total || 0),
    paymentMode: order.data.payment_mode,
    paymentStatus: order.data.payment_status,
  };
}

export function tagsFor(tenant: string, order: EntityRow) {
  const display = presentOrder(tenant, order);
  const persisted = store.listGarmentUnits(tenant, { orderId: order.id });
  if (persisted.length) return persisted.map((unit, orderIndex) => {
    const item = display.items[unit.itemIndex] as any;
    return {
      tagNumber: unit.activeTagCode, unitId: unit.id, orderNumber: display.orderNumber, invoiceNumber: display.invoiceNumber, customer: display.customer.name, customerPhone: display.customer.phone,
      garment: item?.garmentName || unit.garmentId, service: item?.serviceName || unit.serviceId, sequence: orderIndex + 1,
      lineSequence: unit.sequence, total: persisted.length, state: unit.state, location: unit.location,
      tagPayload: `ELT:v1:${unit.activeTagCode}`,
      orderDate: display.orderDate, expectedDeliveryDate: display.expectedDeliveryDate, notes: display.notes, express: display.fulfillmentMode === 'Express Delivery', specialCare: /special|care|delicate|stain/i.test(String(display.notes || '')),
    };
  });
  if (!display.items.some((item: any) => ['Piece', 'Pair'].includes(String(item.unit)))) return [];
  let orderSequence = 0;
  const physicalTotal = display.items.filter((item: any) => ['Piece', 'Pair'].includes(String(item.unit))).reduce((sum: number, item: any) => sum + Math.max(1, Math.ceil(Number(item.qty) || 1)), 0);
  return display.items.flatMap((item: any, index: number) => {
    if (!['Piece', 'Pair'].includes(String(item.unit))) return [];
    const lineTotal = Math.max(1, Math.ceil(Number(item.qty) || 1));
    return Array.from({ length: lineTotal }, (_, copy) => ({
      tagNumber: `${display.orderNumber}-${String(index + 1).padStart(2, '0')}-${String(copy + 1).padStart(2, '0')}`,
      orderNumber: display.orderNumber,
      invoiceNumber: display.invoiceNumber,
      customer: display.customer.name,
      customerPhone: display.customer.phone,
      garment: item.garmentName,
      service: item.serviceName,
      sequence: ++orderSequence,
      lineSequence: copy + 1,
      total: physicalTotal,
      tagPayload: `ELT:v1:${display.orderNumber}-${String(index + 1).padStart(2, '0')}-${String(copy + 1).padStart(2, '0')}`,
      orderDate: display.orderDate,
      expectedDeliveryDate: display.expectedDeliveryDate,
      notes: display.notes,
      express: display.fulfillmentMode === 'Express Delivery',
      specialCare: /special|care|delicate|stain/i.test(String(display.notes || '')),
    }));
  });
}

export function containerTagsFor(tenant: string, order: EntityRow) {
  const display = presentOrder(tenant, order);
  const orderWeightKg = round(display.items.filter((item: any) => String(item.unit || '') === 'Kilogram').reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0));
  return store.listLaundryContainers(tenant, order.id).map((container) => ({
    tagNumber: container.tagCode, containerId: container.id, tagKind: 'container' as const, orderNumber: display.orderNumber,
    invoiceNumber: display.invoiceNumber, customer: display.customer.name, customerPhone: display.customer.phone, garment: `Laundry bag ${container.sequence} / ${container.total}`, service: orderWeightKg > 0 ? `Order total ${orderWeightKg} kg; individual bag weight not recorded` : 'Bulk container',
    sequence: container.sequence, total: container.total, tagPayload: `ELB:v1:${container.tagCode}`, orderDate: display.orderDate, expectedDeliveryDate: display.expectedDeliveryDate,
    state: container.state, notes: display.notes, express: display.fulfillmentMode === 'Express Delivery', specialCare: /special|care|delicate|stain/i.test(String(display.notes || '')),
  }));
}

export function seedLaundryDefaults(tenant: string) {
  const actor = 'system';
  const categories = new Map<string, EntityRow>();
  for (const [name, color] of [['Men\'s Wear', '#345995'], ['Women\'s Wear', '#9B4D96'], ['Household', '#5D8A66'], ['Accessories', '#9A6B2F'], ['Laundry', '#5B6C5D'], ['Formalwear', '#4C5A8A'], ['Casualwear', '#B66B3C'], ['Ethnicwear', '#9B5A78']]) {
    categories.set(name, store.rowsOf(tenant, 'laundry_category').find((row) => String(row.data.name || '').trim().toLowerCase() === name.toLowerCase()) || createRow(tenant, actor, 'laundry_category', { name, color, active: true }));
  }
  const services = new Map<string, EntityRow>();
  for (const name of ['Dry Cleaning', 'Wash & Fold', 'Wash & Steam Iron', 'Steam Iron']) {
    services.set(name, store.rowsOf(tenant, 'laundry_service').find((row) => String(row.data.name || '').trim().toLowerCase() === name.toLowerCase()) || createRow(tenant, actor, 'laundry_service', { name, active: true }));
  }
  const defaults: Array<[string, string, string, Array<[string, number]>]> = [
    ['Shirt / T-shirt', 'Men\'s Wear', 'Piece', [['Dry Cleaning', 99], ['Steam Iron', 16]]],
    ['Trouser / Pant', 'Men\'s Wear', 'Piece', [['Dry Cleaning', 99], ['Steam Iron', 16]]],
    ['Saree', 'Women\'s Wear', 'Piece', [['Dry Cleaning', 180], ['Steam Iron', 89]]],
    ['Kurti', 'Women\'s Wear', 'Piece', [['Dry Cleaning', 129], ['Steam Iron', 16]]],
    ['Blanket', 'Household', 'Piece', [['Dry Cleaning', 320], ['Steam Iron', 49]]],
    ['Bed sheet', 'Household', 'Piece', [['Dry Cleaning', 165], ['Steam Iron', 39]]],
    ['Mixed clothes', 'Laundry', 'Kilogram', [['Wash & Fold', 80], ['Wash & Steam Iron', 120]]],
    ['Shoe pair', 'Accessories', 'Pair', [['Dry Cleaning', 329]]],
    ['Blazer / Suit', 'Formalwear', 'Piece', [['Dry Cleaning', 349], ['Steam Iron', 79]]],
    ['Dress / Gown', 'Women\'s Wear', 'Piece', [['Dry Cleaning', 299], ['Steam Iron', 69]]],
    ['Jeans / Denim', 'Casualwear', 'Piece', [['Dry Cleaning', 149], ['Wash & Fold', 89]]],
    ['Hoodie / Sweatshirt', 'Casualwear', 'Piece', [['Dry Cleaning', 179], ['Wash & Fold', 99]]],
    ['Kurta', 'Ethnicwear', 'Piece', [['Dry Cleaning', 159], ['Steam Iron', 39]]],
    ['Polo shirt', 'Casualwear', 'Piece', [['Dry Cleaning', 109], ['Wash & Fold', 59], ['Steam Iron', 18]]],
    ['Formal shirt', 'Men\'s Wear', 'Piece', [['Dry Cleaning', 119], ['Steam Iron', 19]]],
    ['Jacket / Coat', 'Formalwear', 'Piece', [['Dry Cleaning', 299], ['Steam Iron', 69]]],
    ['Kurta pyjama', 'Ethnicwear', 'Piece', [['Dry Cleaning', 239], ['Steam Iron', 59]]],
    ['Sherwani', 'Ethnicwear', 'Piece', [['Dry Cleaning', 499], ['Steam Iron', 119]]],
    ['Blouse', 'Women\'s Wear', 'Piece', [['Dry Cleaning', 119], ['Steam Iron', 29]]],
    ['Salwar suit', 'Ethnicwear', 'Piece', [['Dry Cleaning', 259], ['Steam Iron', 69]]],
    ['Lehenga', 'Ethnicwear', 'Piece', [['Dry Cleaning', 499], ['Steam Iron', 129]]],
    ['Tie / Scarf', 'Accessories', 'Piece', [['Dry Cleaning', 79], ['Steam Iron', 19]]],
    ['Socks pair', 'Accessories', 'Pair', [['Wash & Fold', 39], ['Dry Cleaning', 69]]],
    ['Towel', 'Household', 'Piece', [['Wash & Fold', 49], ['Dry Cleaning', 89]]],
    ['Pillow cover', 'Household', 'Piece', [['Wash & Fold', 39], ['Dry Cleaning', 69]]],
    ['Curtain', 'Household', 'Piece', [['Dry Cleaning', 199], ['Wash & Fold', 129]]],
    ['Carpet / Rug', 'Household', 'Square Foot', [['Dry Cleaning', 35], ['Wash & Fold', 25]]],
    ['Quilt / Duvet', 'Household', 'Piece', [['Dry Cleaning', 399], ['Wash & Fold', 249]]],
    ['Table cloth', 'Household', 'Piece', [['Wash & Fold', 59], ['Dry Cleaning', 99]]],
    ['Handbag', 'Accessories', 'Piece', [['Dry Cleaning', 249]]],
    ['Soft toy', 'Household', 'Piece', [['Dry Cleaning', 149], ['Wash & Fold', 99]]],
    ['Uniform set', 'Men\'s Wear', 'Piece', [['Dry Cleaning', 199], ['Wash & Fold', 129], ['Steam Iron', 39]]],
  ];
  const garmentVisualByName: Record<string, string> = {
    'Shirt / T-shirt': '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp',
    'Trouser / Pant': '/ui/app/garments/optimized/lndry-folded-trouser-v1.webp',
    Saree: '/ui/app/garments/optimized/lndry-folded-saree-v1.webp',
    Kurti: '/ui/app/garments/optimized/lndry-folded-kurti-v1.webp',
    Blanket: '/ui/app/garments/optimized/lndry-folded-blanket-v1.webp',
    'Bed sheet': '/ui/app/garments/optimized/lndry-folded-bedsheet-v1.webp',
    'Mixed clothes': '/ui/app/garments/optimized/lndry-mixed-clothes-v1.webp',
    'Shoe pair': '/ui/app/garments/optimized/lndry-shoe-pair-v1.webp',
    'Blazer / Suit': '/ui/app/garments/optimized/lndry-folded-blazer-v1.webp',
    'Dress / Gown': '/ui/app/garments/optimized/lndry-folded-dress-v1.webp',
    'Jeans / Denim': '/ui/app/garments/optimized/lndry-folded-jeans-v1.webp',
    'Hoodie / Sweatshirt': '/ui/app/garments/optimized/lndry-folded-hoodie-v1.webp',
    Kurta: '/ui/app/garments/optimized/lndry-folded-kurta-v1.webp',
    'Polo shirt': '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp',
    'Formal shirt': '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp',
    'Jacket / Coat': '/ui/app/garments/optimized/lndry-folded-blazer-v1.webp',
    'Kurta pyjama': '/ui/app/garments/optimized/lndry-folded-kurta-v1.webp',
    Sherwani: '/ui/app/garments/optimized/lndry-sherwani-v1.webp',
    Blouse: '/ui/app/garments/optimized/lndry-blouse-v1.webp',
    'Salwar suit': '/ui/app/garments/optimized/lndry-salwar-suit-v1.webp',
    Lehenga: '/ui/app/garments/optimized/lndry-lehenga-v1.webp',
    'Tie / Scarf': '/ui/app/garments/optimized/lndry-tie-scarf-v1.webp',
    'Socks pair': '/ui/app/garments/optimized/lndry-socks-pair-v1.webp',
    Towel: '/ui/app/garments/optimized/lndry-towel-v1.webp',
    'Pillow cover': '/ui/app/garments/optimized/lndry-pillow-cover-v1.webp',
    Curtain: '/ui/app/garments/optimized/lndry-curtain-v1.webp',
    'Carpet / Rug': '/ui/app/garments/optimized/lndry-carpet-rug-v1.webp',
    'Quilt / Duvet': '/ui/app/garments/optimized/lndry-quilt-duvet-v1.webp',
    'Table cloth': '/ui/app/garments/optimized/lndry-folded-bedsheet-v1.webp',
    Handbag: '/ui/app/garments/optimized/lndry-handbag-v1.webp',
    'Soft toy': '/ui/app/garments/optimized/lndry-soft-toy-v1.webp',
    'Uniform set': '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp',
  };
  const visualKeyByPath: Record<string, string> = {
    '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp': 'foldedShirt', '/ui/app/garments/optimized/lndry-folded-trouser-v1.webp': 'foldedTrouser', '/ui/app/garments/optimized/lndry-folded-saree-v1.webp': 'foldedSaree', '/ui/app/garments/optimized/lndry-folded-kurti-v1.webp': 'foldedKurti', '/ui/app/garments/optimized/lndry-folded-blanket-v1.webp': 'foldedBlanket', '/ui/app/garments/optimized/lndry-folded-bedsheet-v1.webp': 'foldedBedsheet', '/ui/app/garments/optimized/lndry-mixed-clothes-v1.webp': 'mixedClothes', '/ui/app/garments/optimized/lndry-shoe-pair-v1.webp': 'shoePair', '/ui/app/garments/optimized/lndry-folded-blazer-v1.webp': 'foldedBlazer', '/ui/app/garments/optimized/lndry-folded-dress-v1.webp': 'foldedDress', '/ui/app/garments/optimized/lndry-folded-jeans-v1.webp': 'foldedJeans', '/ui/app/garments/optimized/lndry-folded-hoodie-v1.webp': 'foldedHoodie', '/ui/app/garments/optimized/lndry-folded-kurta-v1.webp': 'foldedKurta', '/ui/app/garments/optimized/lndry-sherwani-v1.webp': 'sherwani', '/ui/app/garments/optimized/lndry-blouse-v1.webp': 'blouse', '/ui/app/garments/optimized/lndry-salwar-suit-v1.webp': 'salwarSuit', '/ui/app/garments/optimized/lndry-lehenga-v1.webp': 'lehenga', '/ui/app/garments/optimized/lndry-tie-scarf-v1.webp': 'tieScarf', '/ui/app/garments/optimized/lndry-pillow-cover-v1.webp': 'pillowCover', '/ui/app/garments/optimized/lndry-quilt-duvet-v1.webp': 'quiltDuvet', '/ui/app/garments/optimized/lndry-handbag-v1.webp': 'handbag', '/ui/app/garments/optimized/lndry-towel-v1.webp': 'towel', '/ui/app/garments/optimized/lndry-curtain-v1.webp': 'curtain', '/ui/app/garments/optimized/lndry-carpet-rug-v1.webp': 'carpetRug', '/ui/app/garments/optimized/lndry-soft-toy-v1.webp': 'softToy', '/ui/app/garments/optimized/lndry-socks-pair-v1.webp': 'socksPair',
  };
  for (const [name, category, unit, prices] of defaults) {
    const garment = store.rowsOf(tenant, 'laundry_garment').find((row) => String(row.data.name || '').trim().toLowerCase() === name.toLowerCase()) || createRow(tenant, actor, 'laundry_garment', {
      name, code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '-'), category: categories.get(category)!.id,
      unit, hsn: '9997', gst_rate: 0, visual_key: visualKeyByPath[garmentVisualByName[name]] || '', photo: garmentVisualByName[name] || '', active: true,
    });
    for (const [service, rate] of prices) {
      const serviceId = services.get(service)!.id;
      const exists = store.rowsOf(tenant, 'laundry_price').some((row) => row.data.garment === garment.id && row.data.service === serviceId && !row.data.customer);
      if (!exists) createRow(tenant, actor, 'laundry_price', { garment: garment.id, service: serviceId, rate, active: true });
    }
  }
  ensureStandardLaundryTaxRule(tenant, actor);
  backfillLaundryGarmentVisuals(tenant);
  audit(tenant, actor, 'laundry:catalogue-seeded', { after: { garments: defaults.length } });
}

const STANDARD_LAUNDRY_GST_RULE = 'GST 18% · Laundry service (SAC 9997)';

/**
 * Adds the currently verified standard laundry-service GST rule once per
 * scoped catalogue. The booking desk defaults it only after the supplier has
 * configured a registered GST profile; that profile remains the authority for
 * whether GST can be enabled.
 */
export function ensureStandardLaundryTaxRule(tenant: string, actor = 'system') {
  const existing = store.rowsOf(tenant, 'laundry_tax_rule').find((row) => String(row.data.name || '').trim().toLowerCase() === STANDARD_LAUNDRY_GST_RULE.toLowerCase());
  if (existing) return { id: existing.id, ...existing.data };
  const row = createRow(tenant, actor, 'laundry_tax_rule', { name: STANDARD_LAUNDRY_GST_RULE, rate: 18, active: true });
  audit(tenant, actor, 'laundry:standard-gst-rule-added', { entity: row.entity, row_id: row.id, after: { name: STANDARD_LAUNDRY_GST_RULE, rate: 18, classification: 'SAC 9997', source: 'CBIC GST Goods and Services Rates' } });
  return { id: row.id, ...row.data };
}
