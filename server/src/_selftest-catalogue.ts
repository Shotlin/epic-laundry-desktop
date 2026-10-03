import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'epic-catalogue-test-'));
process.env.EPIC_DATA_FILE = join(tempDir, 'epic.json');
let closeStore: (() => void) | undefined;

try {
  const { store } = await import('./kernel/store.js');
  closeStore = () => store.close();
  const {
    bookLaundryOrder, createLaundryGarmentWithPrice, importLaundryCatalogue, importLaundryPrices, laundryCatalogue, listLaundryCategories, listLaundryChargeRules, listLaundryDiscountRules, listLaundryImportJobs, listLaundryServices, presentOrder, quoteLaundryOrder,
    saveLaundryCategory, saveLaundryChargeRule, saveLaundryDiscountRule, saveLaundryGarment, saveLaundryPrice,
    saveLaundryService, saveLaundryServiceUnit, saveLaundryTaxRule, seedLaundryDefaults, setLaundryServiceUnitActive,
  } = await import('./modules/laundry/domain.js');
  const { auditGarmentAssets } = await import('./modules/laundry/garment-assets.js');

  const tenant = 'CATALOGUE';
  const actor = 'catalogue-owner';
  seedLaundryDefaults(tenant);
  const initial = laundryCatalogue(tenant);
  const mensWear = initial.categories.find((category: any) => category.name === "Men's Wear")!;
  const steamIron = initial.services.find((service: any) => service.name === 'Steam Iron')!;
  const shirt = initial.garments.find((garment: any) => garment.name === 'Shirt / T-shirt')!;
  const standardLaundryGst = initial.taxRules.find((rule: any) => rule.name === 'GST 18% · Laundry service (SAC 9997)')!;
  assert.equal((standardLaundryGst as any).rate, 18, 'the seeded standard laundry GST rule is explicitly 18%');

  const category = saveLaundryCategory(tenant, actor, { name: 'Delicate items', color: '#664CF0', sortOrder: 8 });
  assert.equal((category as any).color, '#664CF0', 'category metadata is persisted');
  assert.throws(() => saveLaundryCategory(tenant, actor, { name: 'delicate ITEMS' }), /already exists/, 'category names are constrained case-insensitively');
  assert.throws(() => saveLaundryCategory(tenant, actor, { name: 'HOUSE HOLD' }), /same name ignoring case and spaces/, 'category names cannot duplicate an existing label by adding spaces or changing case');

  const service = saveLaundryService(tenant, actor, { name: 'Premium Steam', description: 'Finishing for delicate fabrics', units: ['Piece', 'Pair'] });
  const garment = saveLaundryGarment(tenant, actor, { name: 'Silk scarf', code: 'SILK-SCARF', category: category.id, unit: 'Piece', visualKey: 'foldedShirt', photo: '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp' });
  assert.equal((garment as any).photo, '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp', 'only approved local garment assets are accepted');
  assert.equal((garment as any).visual_key, 'foldedShirt', 'catalogue garments persist an explicit visual identity');
  const uploadedGarment = saveLaundryGarment(tenant, actor, { name: 'Upload-safe tie', code: 'UPLOAD-TIE', category: category.id, unit: 'Piece', visualKey: 'foldedShirt', photo: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.match(String((uploadedGarment as any).photo), /^data:image\/png;base64,/, 'validated local image data can be stored with garment metadata');
  assert.throws(() => saveLaundryGarment(tenant, actor, { name: 'Unsafe asset', category: category.id, unit: 'Piece', visualKey: 'foldedShirt', photo: 'https://example.test/image.png' }), /approved local application asset/, 'external image URLs cannot be stored as attachment metadata');
  assert.equal(listLaundryCategories(tenant).find((item) => item.id === category.id)?.usageCount, 2, 'settings category list reports active garment usage');
  assert.throws(() => saveLaundryCategory(tenant, actor, { name: (category as any).name, color: (category as any).color, sortOrder: (category as any).sort_order, active: false }, category.id), /move active garments/, 'a category with active garments cannot be switched off');
  saveLaundryCategory(tenant, actor, { name: 'Temporary category', active: false });
  assert.equal(listLaundryCategories(tenant).some((item) => item.name === 'Temporary category' && item.active === false), true, 'settings list retains switched-off categories for restoration');

  const generalPrice = saveLaundryPrice(tenant, actor, { garment: garment.id, service: service.id, rate: 89 });
  assert.equal((generalPrice as any).rate, 89, 'general price rule is persisted');
  const quickAdd = createLaundryGarmentWithPrice(tenant, actor, { garment: { name: 'Quick add cotton coat', category: category.id, unit: 'Piece' }, service: service.id, rate: 125 });
  assert.equal((quickAdd as any).garment.name, 'Quick add cotton coat', 'quick add saves a new garment');
  assert.equal((quickAdd as any).price.rate, 125, 'quick add saves its first service price');
  assert.equal((quickAdd as any).garment.visual_key, 'foldedBlazer', 'quick add assigns the matching approved visual');
  const quickAddRetry = createLaundryGarmentWithPrice(tenant, actor, { garment: { name: 'Quick add cotton coat', category: category.id, unit: 'Piece' }, service: service.id, rate: 125 });
  assert.equal((quickAddRetry as any).garment.id, (quickAdd as any).garment.id, 'retry reuses an exactly matching garment instead of duplicating it');
  assert.equal((quickAddRetry as any).price.id, (quickAdd as any).price.id, 'retry reuses the already saved general price');
  assert.throws(() => createLaundryGarmentWithPrice(tenant, actor, { garment: { name: 'Quick add cotton coat', category: category.id, unit: 'Piece' }, service: service.id, rate: 126 }), /different price/, 'quick add cannot silently overwrite an existing service price');
  const beforeInvalidQuickAdd = laundryCatalogue(tenant).garments.length;
  assert.throws(() => createLaundryGarmentWithPrice(tenant, actor, { garment: { name: 'Quick add invalid curtain', category: category.id, unit: 'Square Foot' }, service: service.id, rate: 126 }), /does not support the garment unit/, 'a service that does not support the selected unit rejects quick add');
  assert.equal(laundryCatalogue(tenant).garments.length, beforeInvalidQuickAdd, 'a failed first-price validation rolls back the garment creation');
  assert.equal(listLaundryServices(tenant).find((item) => item.id === service.id)?.usageCount, 2, 'settings service list reports active price-rule usage after quick add');
  assert.throws(() => saveLaundryService(tenant, actor, { name: (service as any).name, description: (service as any).description, units: (service as any).units, active: false }, service.id), /disable or move active price rules/, 'a service with active prices cannot be switched off');
  saveLaundryService(tenant, actor, { name: 'Temporary service', units: ['Piece'], active: false });
  assert.equal(listLaundryServices(tenant).some((item) => item.name === 'Temporary service' && item.active === false), true, 'settings list retains switched-off services for restoration');
  assert.equal(laundryCatalogue(tenant).services.some((item) => item.name === 'Temporary service'), false, 'switched-off services are hidden from new catalogue selection');

  const customUnit = saveLaundryServiceUnit(tenant, actor, { fullName: 'Bundle', shortName: 'Bdl' });
  const bundleService = saveLaundryService(tenant, actor, { name: 'Bundle Care', units: [customUnit.value] });
  const bundleGarment = saveLaundryGarment(tenant, actor, { name: 'Test bundle', code: 'TEST-BUNDLE', category: category.id, unit: customUnit.value, visualKey: 'foldedShirt', photo: '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp' });
  const bundlePrice = saveLaundryPrice(tenant, actor, { garment: bundleGarment.id, service: bundleService.id, rate: 25 });
  assert.equal(laundryCatalogue(tenant).serviceUnits.includes('Bundle'), true, 'custom units are available in owner catalogue forms');
  assert.equal(quoteLaundryOrder(tenant, { items: [{ garment: bundleGarment.id, service: bundleService.id, qty: 1 }] }).items[0].rate, 25, 'custom unit catalogue rows can be priced and quoted');
  const renamedUnit = saveLaundryServiceUnit(tenant, actor, { fullName: 'Parcel', shortName: 'Pcl' }, customUnit.id);
  assert.equal((renamedUnit as any).value, 'Parcel', 'custom units keep their full name as the stable catalogue value');
  assert.equal((store.getRow(tenant, bundleGarment.id) as any).data.unit, 'Parcel', 'renaming a unit updates current garment master data');
  assert.equal((store.getRow(tenant, bundleService.id) as any).data.units.includes('Parcel'), true, 'renaming a unit updates current service applicability');
  assert.equal(quoteLaundryOrder(tenant, { items: [{ garment: bundleGarment.id, service: bundleService.id, qty: 1 }] }).items[0].priceRule, bundlePrice.id, 'unit rename preserves the existing price rule');
  assert.throws(() => setLaundryServiceUnitActive(tenant, actor, customUnit.id, false), /remove this unit/, 'a unit in use cannot be archived');
  saveLaundryGarment(tenant, actor, { name: 'Test bundle', code: 'TEST-BUNDLE', category: category.id, unit: 'Piece', visualKey: 'foldedShirt', photo: '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp' }, bundleGarment.id);
  saveLaundryService(tenant, actor, { name: 'Bundle Care', units: ['Piece'] }, bundleService.id);
  setLaundryServiceUnitActive(tenant, actor, customUnit.id, false);
  assert.equal(laundryCatalogue(tenant).serviceUnits.includes('Parcel'), false, 'archived units are hidden from new catalogue selection');
  setLaundryServiceUnitActive(tenant, actor, customUnit.id, true);
  assert.equal(laundryCatalogue(tenant).serviceUnits.includes('Parcel'), true, 'archived units can be restored');
  assert.throws(() => saveLaundryPrice(tenant, actor, { garment: garment.id, service: service.id, rate: 99 }), /matching general/, 'duplicate price rules are rejected');
  const seededCustomerOrder = bookLaundryOrder(tenant, actor, { customer: { name: 'Special price customer', phone: '9000000501' }, items: [{ garment: shirt.id, service: steamIron.id, qty: 1 }], expectedDeliveryDate: '2026-09-01', fulfillmentMode: 'Home Delivery' });
  const customer = seededCustomerOrder.order.customer.id ? store.getRow(tenant, seededCustomerOrder.order.customer.id) : undefined;
  if (!customer) throw new Error('customer booking setup failed');
  const specialPrice = saveLaundryPrice(tenant, actor, { garment: garment.id, service: service.id, customer: customer.id, rate: 69 });
  const specialQuote = quoteLaundryOrder(tenant, { items: [{ garment: garment.id, service: service.id, qty: 1 }] }, customer.id);
  assert.equal(specialQuote.items[0].rate, 69, 'customer-specific price takes precedence');
  assert.equal(specialQuote.items[0].priceRule, specialPrice.id, 'quoted item persists the applied price rule identity');

  const charge = saveLaundryChargeRule(tenant, actor, { name: 'Express handling', type: 'Percentage', amount: 10, expressCharge: true });
  assert.equal((charge as any).expressCharge, true, 'the express-charge flag is persisted with a charge rule');
  assert.equal((laundryCatalogue(tenant).chargeRules.find((rule: any) => rule.id === charge.id) as any)?.expressCharge, true, 'the active counter catalogue exposes the express-charge flag');
  saveLaundryChargeRule(tenant, actor, { name: 'Express handling', type: 'Percentage', amount: 10, expressCharge: true, active: false }, charge.id);
  assert.equal(listLaundryChargeRules(tenant).find((rule: any) => rule.id === charge.id)?.active, false, 'the owner charge list retains paused rules');
  assert.equal(laundryCatalogue(tenant).chargeRules.some((rule: any) => rule.id === charge.id), false, 'paused charges stay out of the active counter catalogue');
  saveLaundryChargeRule(tenant, actor, { name: 'Express handling', type: 'Percentage', amount: 10, expressCharge: true }, charge.id);
  assert.equal(laundryCatalogue(tenant).chargeRules.some((rule: any) => rule.id === charge.id), true, 'reactivated charges return to the active counter catalogue');
  const discount = saveLaundryDiscountRule(tenant, actor, { name: 'Loyalty saving', type: 'Flat', amount: 5 });
  const tax = saveLaundryTaxRule(tenant, actor, { name: 'Standard GST', rate: 5 });
  const governedQuote = quoteLaundryOrder(tenant, { items: [{ garment: garment.id, service: service.id, qty: 1 }], chargeRuleIds: [charge.id], discountRuleIds: [discount.id], taxRuleId: tax.id }, customer.id);
  assert.deepEqual({ charges: governedQuote.charges, discounts: governedQuote.discounts, taxRate: governedQuote.taxRate, grandTotal: governedQuote.grandTotal }, { charges: 6.9, discounts: 5, taxRate: 5, grandTotal: 74.45 }, 'selected charge, discount, and tax rules calculate server-side');
  saveLaundryDiscountRule(tenant, actor, { name: 'Loyalty saving', type: 'Flat', amount: 5, active: false }, discount.id);
  assert.equal(listLaundryDiscountRules(tenant).find((rule: any) => rule.id === discount.id)?.active, false, 'the owner list retains paused discount rules for later reactivation');
  assert.equal(laundryCatalogue(tenant).discountRules.some((rule: any) => rule.id === discount.id), false, 'paused discounts stay out of the active counter catalogue');
  saveLaundryDiscountRule(tenant, actor, { name: 'Loyalty saving', type: 'Flat', amount: 5, active: true }, discount.id);
  assert.equal(laundryCatalogue(tenant).discountRules.some((rule: any) => rule.id === discount.id), true, 'reactivated discounts return to the counter catalogue');
  const standardGstQuote = quoteLaundryOrder(tenant, { items: [{ garment: garment.id, service: service.id, qty: 1 }], taxRuleId: standardLaundryGst.id }, customer.id);
  assert.equal(standardGstQuote.taxRate, 18, 'the standard 18% GST rule applies through the same server-side quote path');

  const namedPricingOrder = bookLaundryOrder(tenant, actor, {
    customer: { id: customer.id },
    items: [{ garment: garment.id, service: service.id, qty: 1 }],
    expectedDeliveryDate: '2026-09-02',
    fulfillmentMode: 'Home Delivery',
    chargeRuleIds: [charge.id],
    discountRuleIds: [discount.id],
    taxRuleId: tax.id,
  });
  assert.deepEqual(namedPricingOrder.order.breakdown, {
    charges: [{ label: 'Express handling', percent: 10, amount: 6.9 }],
    discounts: [{ label: 'Loyalty saving', percent: null, amount: 5 }],
    tax: { label: 'GST', percent: 5, amount: 3.55 },
  }, 'a booked order retains selected adjustment labels and the existing server quote amounts');
  const savedNamedPricingOrder = store.getRow(tenant, namedPricingOrder.order.id)!;
  assert.deepEqual(savedNamedPricingOrder.data.price_breakdown, namedPricingOrder.order.breakdown, 'adjustment labels are saved with the order snapshot');
  saveLaundryChargeRule(tenant, actor, { name: 'Express handling updated', type: 'Flat', amount: 99 }, charge.id);
  saveLaundryDiscountRule(tenant, actor, { name: 'Loyalty saving updated', type: 'Percentage', amount: 50 }, discount.id);
  const reopenedNamedPricingOrder = presentOrder(tenant, savedNamedPricingOrder);
  assert.deepEqual(reopenedNamedPricingOrder.breakdown, namedPricingOrder.order.breakdown, 'later master-rule edits do not rewrite historical order price details');
  assert.equal(reopenedNamedPricingOrder.charges, 6.9, 'the saved charge total stays independent of later rule edits');
  assert.equal(reopenedNamedPricingOrder.discounts, 5, 'the saved discount total stays independent of later rule edits');

  const booked = bookLaundryOrder(tenant, actor, { customer: { name: 'Historic rate customer', phone: '9000000551' }, items: [{ garment: shirt.id, service: steamIron.id, qty: 1 }], expectedDeliveryDate: '2026-09-01', fulfillmentMode: 'Home Delivery' });
  const existingShirtPrice = initial.prices.find((price: any) => price.garment === shirt.id && price.service === steamIron.id)!;
  saveLaundryPrice(tenant, actor, { garment: shirt.id, service: steamIron.id, rate: 32 }, existingShirtPrice.id);
  const historical = store.getRow(tenant, booked.order.id)!;
  assert.equal(historical.data.items[0].rate, 16, 'later master-price edits never rewrite booked order prices');
  assert.equal(Boolean(historical.data.items[0].priceRule), true, 'booked items retain their applied price-rule reference');

  const imported = importLaundryPrices(tenant, actor, [
    { garmentName: 'Imported cover', categoryName: 'Household', serviceName: 'Dry Cleaning', rate: 120, unit: 'Piece' },
    { garmentName: '', serviceName: 'Dry Cleaning', rate: 120 },
  ]);
  assert.equal(imported.errors.length, 2, 'imports report row-level validation errors including missing visual review');
  assert.equal(imported.job?.status, 'Completed with errors', 'imports create a durable job record');
  const jobs = listLaundryImportJobs(tenant, 'prices');
  assert.equal(jobs[0]?.skippedRows, 2, 'import history retains actionable rejection counts');
  assert.equal(jobs[0]?.errors[0]?.row, 2, 'import history retains worksheet row references');
  const importedCatalogue = importLaundryCatalogue(tenant, actor, {
    categories: [{ id: 'owner-category-1', name: 'Imported premium', color: '#123456' }],
    services: [{ id: 'owner-service-1', name: 'Imported care', description: 'Owner supplied care', units: ['Piece'] }],
    garments: [{ id: 'owner-garment-1', name: 'Imported coat', code: 'IMPORTED-COAT', category: 'Imported premium', unit: 'Piece', hsn: '9997', gstRate: 5, visualKey: 'foldedBlazer', photo: '/ui/app/garments/optimized/lndry-folded-blazer-v1.webp' }],
    prices: [{ id: 'owner-price-1', garment: 'Imported coat', service: 'Imported care', rate: 275 }],
    taxRules: [{ id: 'owner-tax-1', name: 'Imported GST', rate: 5 }],
  });
  assert.equal(importedCatalogue.created >= 5, true, 'owner catalogue import creates the complete scoped master set');
  assert.equal(laundryCatalogue(tenant).prices.some((price: any) => price.garmentName === 'Imported coat' && price.serviceName === 'Imported care' && price.rate === 275), true, 'owner catalogue import resolves name references into active price rules');
  assert.equal(listLaundryImportJobs(tenant, 'catalogue')[0]?.status, 'Completed', 'owner catalogue import creates a durable completed import job');
  const beforeFailedImport = laundryCatalogue(tenant).garments.length;
  assert.throws(() => importLaundryCatalogue(tenant, actor, { garments: [{ name: 'Should roll back', category: 'Missing category', unit: 'Piece' }] }), /not found/, 'invalid owner catalogue references are rejected');
  assert.equal(laundryCatalogue(tenant).garments.length, beforeFailedImport, 'failed catalogue import restores the pre-import branch snapshot');
  assert.equal(laundryCatalogue(tenant).serviceUnits.includes('Kilogram'), true, 'all required service units are exposed to the owner desk');
  assert.equal(mensWear.id.length > 0, true, 'default catalogue remains readable after owner configuration commands');
  const assetAudit = auditGarmentAssets(tenant);
  assert.equal(assetAudit.ok, true, 'all active catalogue garments resolve to an explicit valid visual asset');

  console.log('PASS  catalogue commands, governed pricing, snapshots, and import jobs self-test complete');
} finally {
  closeStore?.();
  rmSync(tempDir, { recursive: true, force: true });
}
