import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'epic-booking-discount-'));
process.env.EPIC_DB_FILE = join(dir, 'workspace.sqlite');
process.env.EPIC_LEGACY_JSON_FILE = join(dir, 'legacy.json');
const { store } = await import('./kernel/store.js');
try {
  const { bookLaundryOrder, laundryCatalogue, seedLaundryDefaults } = await import('./modules/laundry/domain.js');
  const { approveTaxPolicyRule, createTaxPolicyRule, saveSupplierTaxProfile } = await import('./modules/gst/tax-policy.js');
  const { createRow, submitRow } = await import('./kernel/entity-service.js');
  const { ensureCanonicalInvoiceForLegacy } = await import('./modules/gst/legacy-invoice-bridge.js');
  store.withStoreScope('DISCOUNT', 'STORE-DEFAULT', () => {
    saveSupplierTaxProfile('DISCOUNT', 'owner', { legalName: 'Booking Test Laundry', address: 'Test address', stateCode: '29', pincode: '560001', registrationStatus: 'Registered', gstin: '29ABCDE1234F1Z5', invoiceSeries: 'TEST', einvoiceState: 'NotApplicable' });
    store.saveStoreSettings('DISCOUNT', 'owner', { businessName: 'Test Laundry', address: 'Test address', phone: '9000000199', taxMode: 'gst', gstin: '29ABCDE1234F1Z5' });
    const rule = createTaxPolicyRule('DISCOUNT', 'owner', { classificationType: 'SAC', classificationCode: '9997', description: 'Laundry', supplyType: 'Service', rateBps: 1800, validFrom: '2026-01-01', validTo: '2027-12-31', sourceNote: 'Regression fixture', version: '1' });
    approveTaxPolicyRule('DISCOUNT', 'owner', rule.id);
    seedLaundryDefaults('DISCOUNT');
    const catalogue = laundryCatalogue('DISCOUNT');
    const mixed = catalogue.garments.find((item) => item.name === 'Mixed clothes')!;
    const shirt = catalogue.garments.find((item) => item.unit === 'Piece')!;
    const prices = catalogue.prices as unknown as Array<{ garment: string; service: string }>;
    const mixedPrice = prices.find((item) => item.garment === mixed.id)!;
    const shirtPrice = prices.find((item) => item.garment === shirt.id)!;
    const chargeRule = createRow('DISCOUNT', 'owner', 'laundry_charge_rule', { name: 'Express test', type: 'Flat', amount: 60, active: true });
    const discountRule = createRow('DISCOUNT', 'owner', 'laundry_discount_rule', { name: 'Welcome test', type: 'Percentage', amount: 10, active: true });
    const baseItems = [{ garment: mixed.id, service: mixedPrice.service, qty: 0.1, rateOverride: 50 }, { garment: shirt.id, service: shirtPrice.service, qty: 1, rateOverride: 640 }];
    const cases = [
      { label: 'screenshot: Welcome discount exceeds Express charge', chargeRuleIds: [chargeRule.id], discountRuleIds: [discountRule.id] },
      { label: 'custom discount only', discounts: 35 },
      { label: 'custom discount exceeds charge', charges: 10, discounts: 75 },
      { label: 'positive adjustment', charges: 30, discounts: 5 },
      { label: 'equal adjustments', charges: 20, discounts: 20 },
      { label: 'penny rounding', discounts: 0.03 },
      { label: 'near full discount', discounts: 644.99 },
    ];
    for (const [index, adjustments] of cases.entries()) {
      const booked = bookLaundryOrder('DISCOUNT', 'owner', { customer: { name: `Regression ${index}`, phone: `90000002${String(index).padStart(2, '0')}` }, items: baseItems, ...adjustments, taxRate: 18, orderDate: '2026-10-03', expectedDeliveryDate: '2026-10-06', fulfillmentMode: 'Pickup Order', paymentMode: 'Pay Later' });
      const row = store.getRow('DISCOUNT', booked.order.id)!;
      const invoice = store.getRow('DISCOUNT', String(row.data.invoice))!;
      const snapshot = store.getRow('DISCOUNT', String(row.data.canonical_invoice_snapshot_id))!;
      assert.equal(booked.receipt.items[0].amount, 5, '0.1 kg × ₹50/kg is ₹5');
      assert.equal(snapshot.data.tax.totals.totalPaise, Math.round(booked.order.grandTotal * 100), adjustments.label);
      assert.equal(Math.round(Number(invoice.data.grand_total) * 100), snapshot.data.tax.totals.totalPaise, 'ledger, receipt and canonical total agree');
      assert.ok(snapshot.data.tax.lines.every((line: any) => line.unitPricePaise >= 0 && line.taxablePaise >= 0), 'discount never creates a negative service price');
      assert.equal(snapshot.data.tax.lines[0].unit, 'Kilogram');
      assert.equal(snapshot.data.tax.lines[0].quantityMilli, 100);
    }
    const party = store.rowsOf('DISCOUNT', 'party').find((row) => row.data.is_customer)!;
    const badInvoice = submitRow('DISCOUNT', 'owner', 'sales_invoice', createRow('DISCOUNT', 'owner', 'sales_invoice', { customer: party.id, place_of_supply: '29', posting_date: '2026-10-03', items: [{ item: shirt.id, qty: 1, rate: -5, gst_rate: 18, hsn: '9997' }, { item: mixed.id, qty: 1, rate: 100, gst_rate: 18, hsn: '9997' }] }).id);
    assert.throws(() => ensureCanonicalInvoiceForLegacy('DISCOUNT', 'owner', badInvoice.id), /rate cannot be negative/, 'actual negative garment prices remain invalid');
  });
  console.log('PASS booking discount regression: fractional weight, configured/custom adjustments, penny rounding, unit evidence, and negative-price rejection');
} finally {
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
