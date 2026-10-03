import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'epic-laundry-test-'));
process.env.EPIC_DATA_FILE = join(tempDir, 'epic.json');
let closeStore: (() => void) | undefined;

try {
  const { store } = await import('./kernel/store.js');
  closeStore = () => store.close();
  const { createLaundryRegressionFixture } = await import('./testing/laundry-regression-fixture.js');
  const { laundryBusinessDate } = await import('./modules/laundry/dates.js');
  const { listLaundryMessageTemplates, saveLaundryMessageTemplate, setLaundryMessageTemplateActive } = await import('./modules/laundry/message-templates.js');
  const {
    assignLaundryOrder, bookLaundryOrder, cancelLaundryExpense, cancelLaundryOrder, createLaundryExpense, createLaundryRider, editLaundryExpense, editLaundryOrder, importLaundryCustomers, importLaundryPrices, previewLaundryImport, isLaundryReportLocked, laundryCatalogue, laundryDashboard, laundryDispatch, laundryReportChart, laundryReportDetail, laundryReportDetailStream, laundryReports, laundryStatistics, listLaundryExpenses, listLaundryOrderFilterOptions, listLaundryOrderPage, listLaundryOrders, listLaundryRiderSettlements, quoteLaundryOrder, recordLaundryFulfillment, saveLaundryRiderSettlement, scanLaundryGarment, seedLaundryDefaults, transitionLaundryOrder,
  } = await import('./modules/laundry/domain.js');

  const tenant = 'TEST';
  assert.equal(laundryBusinessDate(new Date('2026-08-27T19:00:00.000Z'), 'Asia/Kolkata'), '2026-08-28', 'laundry business dates follow the configured local timezone');
  seedLaundryDefaults(tenant);
  const initialMessageTemplates = listLaundryMessageTemplates(tenant);
  assert.deepEqual(initialMessageTemplates.map((template: any) => template.key), ['order-booked', 'order-processing', 'order-done', 'order-delivered'], 'message settings match the four observed order-stage tabs');
  assert.equal(initialMessageTemplates.every((template: any) => template.active), true, 'new stores receive active default message templates without a settings write');
  assert.throws(() => saveLaundryMessageTemplate(tenant, 'test@epic.local', 'order-booked', 'Hello {UnknownField}'), /MESSAGE_TEMPLATE_PLACEHOLDER_UNKNOWN/, 'unsupported message placeholders are rejected');
  const savedMessageTemplate = saveLaundryMessageTemplate(tenant, 'test@epic.local', 'order-booked', 'Hello {CustomerName}, order {OrderNo} is ready.');
  assert.equal(savedMessageTemplate.body, 'Hello {CustomerName}, order {OrderNo} is ready.', 'template edit persists the explicit message body');
  assert.equal(listLaundryMessageTemplates(tenant).find((template: any) => template.key === 'order-booked')?.body, savedMessageTemplate.body, 'template edit is returned on reload');
  const archivedMessageTemplate = setLaundryMessageTemplateActive(tenant, 'test@epic.local', 'order-booked', false);
  assert.equal(archivedMessageTemplate.active, false, 'message template archive is reversible');
  const otherBranchMessageTemplate = store.withStoreScope(tenant, 'TEST-OTHER', () => listLaundryMessageTemplates(tenant).find((template: any) => template.key === 'order-booked'));
  assert.equal(otherBranchMessageTemplate?.active, true, 'message template settings stay scoped to their store');
  assert.equal(otherBranchMessageTemplate?.body, initialMessageTemplates[0].body, 'another store does not inherit edited message content');
  setLaundryMessageTemplateActive(tenant, 'test@epic.local', 'order-booked', true);
  const catalogue = laundryCatalogue(tenant);
  assert.equal(catalogue.garments.length, 32, 'default laundry catalogue persists the expanded garment master');
  assert.equal(catalogue.services.length, 4, 'default laundry catalogue persists services');

  const shirt = catalogue.garments.find((garment: any) => garment.name === 'Shirt / T-shirt')!;
  assert.equal(shirt.photo, '/ui/app/garments/optimized/lndry-folded-shirt-v3.webp', 'the default shirt uses the current Lndry-branded garment image');
  const steamIron = catalogue.services.find((service: any) => service.name === 'Steam Iron')!;
  const quote = quoteLaundryOrder(tenant, {
    items: [{ garment: shirt.id, service: steamIron.id, qty: 2 }], charges: 10, discounts: 5, taxRate: 5,
  });
  assert.equal(quote.subtotal, 32, 'price matrix selects the garment/service rate');
  assert.equal(quote.grandTotal, 38.85, 'charges, discounts and tax calculate precisely');
  const intakeQuote = quoteLaundryOrder(tenant, { items: [{ garment: shirt.id, service: steamIron.id, qty: 1, color: 'Navy', garmentType: 'Delicate', rateOverride: 19 }] });
  assert.deepEqual({ color: intakeQuote.items[0].color, garmentType: intakeQuote.items[0].garmentType, rate: intakeQuote.items[0].rate }, { color: 'Navy', garmentType: 'Delicate', rate: 19 }, 'intake captures colour, care type and an explicit counter price override');

  const result = bookLaundryOrder(tenant, 'test@epic.local', {
    customer: { name: 'Asha Verma', phone: '98765 43210', address: '12 Lndry Lane' },
    items: [{ garment: shirt.id, service: steamIron.id, qty: 2 }],
    expectedDeliveryDate: '2026-08-30', fulfillmentMode: 'Home Delivery',
    paymentMode: 'UPI', charges: 10, discounts: 5, taxRate: 5, photoPaths: 'data:image/png;base64,aA==',
  });
  assert.equal(result.order.state, 'Booked', 'booking creates a persisted laundry order');
  assert.equal(result.order.paymentStatus, 'Paid', 'UPI booking creates and submits a payment entry');
  assert.equal(result.receipt.grandTotal, 38.85, 'receipt uses authoritative quoted totals');
  assert.equal(result.order.deliveryAddress, '12 Lndry Lane', 'booking snapshots the delivery address on the work card');
  assert.equal(result.order.photoPaths, 'data:image/png;base64,aA==', 'booking persists the bounded garment photo attachment');
  const fulfillment = recordLaundryFulfillment(tenant, 'test@epic.local', result.order.id, { itemIndex: 0, stage: 'Picked Up', quantity: 1, note: 'Counter intake' });
  assert.equal(fulfillment.quantity, 1, 'item-level fulfilment records fractional-safe quantity events');
  assert.throws(() => recordLaundryFulfillment(tenant, 'test@epic.local', result.order.id, { itemIndex: 0, stage: 'Picked Up', quantity: 2 }), /exceeds ordered quantity/, 'item-level fulfilment prevents over-delivery');
  assert.equal(result.tags.length, 2, 'one tag is generated per piece');
  assert.deepEqual(result.tags.map((tag) => [tag.sequence, tag.total]), [[1, 2], [2, 2]], 'tags carry an explicit unit sequence');
  assert.equal(result.tags[0].customer, 'Asha Verma', 'tags carry the customer name');
  assert.equal(result.tags[0].orderDate, result.order.orderDate, 'tags carry the order date');
  assert.equal(store.rowsOf(tenant, 'sales_invoice').length, 1, 'booking posts a real sales invoice');
  assert.equal(store.rowsOf(tenant, 'payment_entry').length, 1, 'booking persists payment evidence');
  const invoiceReport = laundryReportDetail(tenant, 'invoice', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(invoiceReport.columns, ['invoiceNumber', 'amount', 'status', 'tax'], 'invoice report keeps the source-specific invoice columns');
  assert.deepEqual(invoiceReport.summary, { label: 'Total Invoice Amount', value: result.order.grandTotal, format: 'currency' }, 'invoice report total covers the complete filtered range');
  const customerReport = laundryReportDetail(tenant, 'customer', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(customerReport.columns, ['customer', 'phone', 'revenue', 'revenueWithoutTax', 'visits', 'lastVisitedDate', 'daysSinceVisit', 'reviews'], 'customer report preserves its source-specific customer and revenue columns');
  assert.deepEqual(customerReport.summary, { label: 'Total Revenue', value: result.order.grandTotal, format: 'currency' }, 'customer report totals the full filtered range');
  const customerReportRow = customerReport.rows[0] as unknown as Record<string, unknown>;
  assert.equal(customerReportRow.customer, 'Asha Verma', 'customer report groups revenue to the customer');
  assert.equal(customerReportRow.revenueWithoutTax, result.order.grandTotal - result.order.taxAmount, 'customer report separates revenue without GST using the recorded order tax');
  assert.equal(customerReportRow.visits, 1, 'customer report counts active visits in the selected date range');
  assert.equal(customerReportRow.lastVisitedDate, result.order.orderDate, 'customer report shows the latest visit in the range');
  assert.equal(customerReportRow.daysSinceVisit, 0, 'customer report calculates days since visit relative to the report end date');
  assert.equal(customerReportRow.reviews, '', 'customer report leaves reviews blank when Epic has no review record');
  const emptyCustomerReport = laundryReportDetail(tenant, 'customer', '1999-01-01', '1999-01-01');
  assert.deepEqual(emptyCustomerReport.columns, customerReport.columns, 'customer report retains its headers in the empty state');
  assert.equal(emptyCustomerReport.summary?.value, 0, 'customer report shows zero total revenue for an empty date range');
  const customerCreatedOn = store.getRow(tenant, result.order.customer.id!)!.created_at.slice(0, 10);
  const customerList = laundryReportDetail(tenant, 'customer-list', customerCreatedOn, customerCreatedOn, '9876543210');
  assert.deepEqual(customerList.columns, ['customer', 'phone'], 'customer list preserves the two source-verified columns');
  assert.deepEqual(customerList.rows, [{ customer: 'Asha Verma', phone: result.order.customer.phone }], 'customer list searches customer name and phone within the customer creation-date range');
  const emptyCustomerList = laundryReportDetail(tenant, 'customer-list', '1999-01-01', '1999-01-01');
  assert.deepEqual(emptyCustomerList.columns, customerList.columns, 'customer list preserves its table headers when the date range is empty');
  assert.equal(emptyCustomerList.totalRows, 0, 'customer list returns an empty state for an empty customer creation-date range');
  const customerListChart = laundryReportChart(tenant, 'customer-list', customerCreatedOn, customerCreatedOn);
  assert.deepEqual(customerListChart.points, [{ label: customerCreatedOn, value: 1 }], 'customer list chart counts customers by their creation date');
  assert.equal(customerListChart.metric, 'New customers', 'customer list chart names the acquisition measure');
  const customerListExport = laundryReportDetailStream(tenant, 'customer-list', customerCreatedOn, customerCreatedOn, '9876543210')!;
  assert.deepEqual(customerListExport.columns, customerList.columns, 'customer list export retains the source-verified columns');
  assert.deepEqual([...customerListExport.rows], customerList.rows, 'customer list export matches its filtered table rows');
  const growthReport = laundryReportDetail(tenant, 'growth', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(growthReport.columns, ['total', 'tax', 'amountWithoutTax'], 'growth report exposes only its three source-verified measures');
  assert.deepEqual(growthReport.rows, [{ total: result.order.grandTotal, tax: result.order.taxAmount, amountWithoutTax: result.order.grandTotal - result.order.taxAmount }], 'growth report totals only active orders in the selected range');
  const emptyGrowthReport = laundryReportDetail(tenant, 'growth', '1999-01-01', '1999-01-01');
  assert.deepEqual(emptyGrowthReport.rows, [{ total: 0, tax: 0, amountWithoutTax: 0 }], 'growth report shows clear zero totals for an empty range');
  const growthChart = laundryReportChart(tenant, 'growth', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(growthChart.points, [{ label: result.order.orderDate, value: result.order.grandTotal }], 'growth chart groups order value by the report date');
  const discountReport = laundryReportDetail(tenant, 'discount', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(discountReport.columns, ['title', 'totalAmount', 'discountAmount', 'amountWithoutDiscount'], 'discount report matches the observed title and three amount columns');
  assert.deepEqual(discountReport.rows, [{ title: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${result.order.orderDate}T00:00:00.000Z`)), totalAmount: result.order.grandTotal, discountAmount: 5, amountWithoutDiscount: result.order.grandTotal + 5 }], 'discount report groups daily order value, discount and pre-discount amount');
  assert.deepEqual(discountReport.summary, { label: 'Total Discount Amount', value: 5, format: 'currency' }, 'discount report summarizes the selected range discount');
  const emptyDiscountReport = laundryReportDetail(tenant, 'discount', '1999-01-01', '1999-01-01');
  assert.deepEqual(emptyDiscountReport.columns, discountReport.columns, 'empty discount report preserves its source-shaped columns');
  assert.deepEqual(emptyDiscountReport.rows, [{ title: 'Friday', totalAmount: 0, discountAmount: 0, amountWithoutDiscount: 0 }], 'empty dated discount report shows a zero daily row');
  assert.deepEqual(emptyDiscountReport.summary, { label: 'Total Discount Amount', value: 0, format: 'currency' }, 'empty discount report shows a zero discount total');
  const discountChart = laundryReportChart(tenant, 'discount', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(discountChart.points, [{ label: result.order.orderDate, value: 5 }], 'discount chart groups discount value by the report date');
  const { createServicePackage, purchaseServicePackage } = await import('./modules/laundry/packages.js');
  const packageDefinition = createServicePackage(tenant, 'test@epic.local', { name: 'Report package fixture', price: 25, validityDays: 30, services: [{ garment: shirt.id, service: steamIron.id, allowance: 3 }] });
  purchaseServicePackage(tenant, 'test@epic.local', { customer: result.order.customer.id!, servicePackage: packageDefinition.id, purchaseDate: result.order.orderDate, paymentMode: 'Pay Later' });
  const invoiceBalanceReport = laundryReportDetail(tenant, 'balance', '1999-01-01', '1999-01-02');
  assert.deepEqual(invoiceBalanceReport.columns, ['customer', 'phone', 'invoiceNumber', 'orderNumber', 'invoiceAmount', 'balanceAmount'], 'invoice balance report matches the observed customer, invoice, and balance columns');
  assert.deepEqual(invoiceBalanceReport.summary, { label: 'Total Balance Amount', value: 25, format: 'currency' }, 'invoice balance report includes an unpaid package contract and ignores table date filters');
  assert.deepEqual(invoiceBalanceReport.rows, [{ customer: 'Asha Verma', phone: result.order.customer.phone, invoiceNumber: 'Package Payment', orderNumber: '-', invoiceAmount: 25, balanceAmount: 25 }], 'invoice balance report labels package receivables like the reference workspace');
  const customerBalanceReport = laundryReportDetail(tenant, 'balance', undefined, undefined, 'Asha', undefined, 1, 100, undefined, false, 'invoice', 'service', 'customer');
  assert.deepEqual(customerBalanceReport.columns, ['customer', 'phone', 'invoiceAmount', 'balanceAmount'], 'customer balance view has grouped customer columns');
  assert.deepEqual(customerBalanceReport.rows, [{ customer: 'Asha Verma', phone: result.order.customer.phone, invoiceAmount: 25, balanceAmount: 25 }], 'customer balance view groups all open receivables and searches customer details');
  assert.equal(laundryReportDetail(tenant, 'balance', undefined, undefined, 'no such customer').summary?.value, 0, 'balance search summary follows the visible matching rows');
  const balanceChart = laundryReportChart(tenant, 'balance', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(balanceChart.points, [{ label: result.order.orderDate, value: 25 }], 'balance chart groups open receivables by their invoice or package date');
  const customerPackageReport = laundryReportDetail(tenant, 'customer-package', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(customerPackageReport.columns, ['customer', 'packageName', 'packageAmount', 'status', 'assigned', 'expires'], 'customer package report retains readable package and status columns');
  assert.deepEqual(customerPackageReport.summary, { label: 'Total Package Amount', value: 25, format: 'currency' }, 'customer package report sums contract package amounts in the selected range');
  assert.equal(customerPackageReport.rows.some((row: any) => row.packageName === packageDefinition.name && row.packageAmount === 25), true, 'customer package report uses the saved package name and contract value');
  const customerPackageExport = laundryReportDetailStream(tenant, 'customer-package', result.order.orderDate, result.order.orderDate)!;
  assert.deepEqual(customerPackageExport.columns, customerPackageReport.columns, 'customer package export preserves report table columns');
  assert.equal([...customerPackageExport.rows].some((row) => row.packageName === packageDefinition.name && row.packageAmount === 25), true, 'customer package cursor export preserves the filtered package value');
  const emptyCustomerPackageReport = laundryReportDetail(tenant, 'customer-package', '1999-01-01', '1999-01-01');
  assert.equal(emptyCustomerPackageReport.totalRows, 0, 'customer package report respects its purchased-date filter');
  assert.equal(emptyCustomerPackageReport.summary?.value, 0, 'customer package report shows zero amount for an empty period');
  const serviceOrderReport = laundryReportDetail(tenant, 'order', result.order.orderDate, result.order.orderDate);
  assert.deepEqual(serviceOrderReport.columns, ['serviceName', 'totalGarments', 'garmentSummary'], 'service-based order report keeps its garment-summary columns');
  assert.deepEqual(serviceOrderReport.summary, { label: 'Total Garment Count', value: 2, format: 'count' }, 'service-based order report totals garment quantities');
  const invoiceOrderReport = laundryReportDetail(tenant, 'order', result.order.orderDate, result.order.orderDate, undefined, undefined, 1, 100, undefined, false, 'invoice', 'invoice');
  assert.deepEqual(invoiceOrderReport.columns, ['orderDate', 'customerName', 'orderNumber', 'invoiceNumber', 'totalGarments', 'garmentSummary'], 'invoice-based order report exposes one row per invoice');
  assert.equal((invoiceOrderReport.rows[0] as unknown as Record<string, unknown>).garmentSummary, 'Shirt / T-shirt (2)', 'invoice-based order report preserves garment quantity detail');
  const upiCollections = laundryReportDetail(tenant, 'collection', undefined, undefined, undefined, 'UPI');
  assert.equal(upiCollections.totalRows, 1, 'collection reporting filters submitted receipts by payment method');
  assert.equal(upiCollections.rows.every((row: any) => row.method === 'UPI'), true, 'collection reporting returns only the selected payment method');
  const customerSearchCollections = laundryReportDetail(tenant, 'collection', undefined, undefined, 'Asha Verma');
  assert.equal(customerSearchCollections.totalRows, 1, 'collection search matches the linked customer');
  const orderSearchCollections = laundryReportDetail(tenant, 'collection', undefined, undefined, result.order.orderNumber);
  assert.equal(orderSearchCollections.totalRows, 1, 'collection search matches the linked order number');
  const unrelatedSearchCollections = laundryReportDetail(tenant, 'collection', undefined, undefined, 'no matching invoice or customer');
  assert.equal(unrelatedSearchCollections.totalRows, 0, 'collection search excludes unrelated payment rows');
  const customerCollections = laundryReportDetail(tenant, 'collection', undefined, undefined, 'Asha Verma', undefined, 1, 100, undefined, false, 'customer');
  assert.deepEqual(customerCollections.columns, ['customerName', 'phone', 'paidInvoices', 'paidAmount'], 'customer collection view exposes customer summary headings');
  assert.equal(customerCollections.totalRows, 1, 'customer collection view groups matching receipts into one customer row');
  const customerCollectionRow = customerCollections.rows[0] as unknown as Record<string, unknown>;
  assert.equal(customerCollectionRow.customerName, 'Asha Verma', 'customer collection view identifies the customer');
  assert.equal(customerCollectionRow.paidInvoices, 1, 'customer collection view counts distinct paid invoices');
  assert.equal(customerCollectionRow.paidAmount, result.receipt.grandTotal, 'customer collection view totals received amounts');
  const invoiceChart = laundryReportChart(tenant, 'invoice', result.order.orderDate, result.order.orderDate);
  assert.equal(invoiceChart.points.reduce((sum, point) => sum + point.value, 0), result.order.grandTotal, 'invoice chart aggregates invoice amounts across the full selected range');
  const collectionChart = laundryReportChart(tenant, 'collection', result.order.orderDate, result.order.orderDate, 'UPI');
  assert.equal(collectionChart.points.reduce((sum, point) => sum + point.value, 0), result.receipt.grandTotal, 'collection chart respects the selected payment method');
  const customerChart = laundryReportChart(tenant, 'customer', result.order.orderDate, result.order.orderDate);
  assert.equal(customerChart.points.reduce((sum, point) => sum + point.value, 0), result.order.grandTotal, 'customer chart sums daily revenue across the selected date range');
  const serviceChart = laundryReportChart(tenant, 'order', result.order.orderDate, result.order.orderDate);
  assert.equal(serviceChart.points.some((point) => point.label === steamIron.name && point.value === result.order.items[0].amount), true, 'order chart groups service totals for its date range');
  assert.throws(() => laundryReportChart(tenant, 'invoice', '2026-08-31', '2026-08-30'), /must not be after/, 'report chart rejects an inverted custom date range');
  const pagedOrders = listLaundryOrderPage(tenant, { search: 'Asha Verma', page: 1, pageSize: 1 });
  assert.equal(pagedOrders.total, 1, 'SQL-backed order search counts the matching customer without loading a full response');
  assert.equal(pagedOrders.items.length, 1, 'SQL-backed order pagination returns the bounded page size');
  const sourceFieldFilters = { phone: result.order.customer.phone.slice(-4), orderNo: result.order.orderNumber.slice(-4).toUpperCase(), customer: 'ASHA' };
  const fieldFilteredOrders = listLaundryOrderPage(tenant, { ...sourceFieldFilters, page: 1, pageSize: 10 });
  assert.equal(fieldFilteredOrders.total, 1, 'phone, order number and customer filters combine without broadening the matching order set');
  assert.equal(fieldFilteredOrders.items[0]?.id, result.order.id, 'SQL order filters match partial phone, case-insensitive order number and customer name values');
  assert.equal(listLaundryOrderPage(tenant, { ...sourceFieldFilters, phone: '000000', page: 1, pageSize: 10 }).total, 0, 'each Store Orders field narrows results independently');
  assert.equal(listLaundryOrders(tenant, sourceFieldFilters).some((order) => order.id === result.order.id), true, 'queue-backed order filtering uses the same phone, order number and customer semantics');
  const bookedStatus = listLaundryOrderPage(tenant, { search: 'Asha Verma', status: 'booked', page: 1, pageSize: 10 });
  assert.equal(bookedStatus.items.some((order) => order.id === result.order.id), true, 'source-style Booked filter maps to Epic Booked orders');
  assert.equal(listLaundryOrderPage(tenant, { status: 'unknown-status', page: 1, pageSize: 10 }).total, 0, 'unknown order status filters fail closed');
  const sourceFilteredOrders = listLaundryOrderPage(tenant, { source: 'By Store', reportedBy: 'test@epic.local', page: 1, pageSize: 10 });
  assert.equal(sourceFilteredOrders.items.some((order) => order.id === result.order.id), true, 'order source and reporter filters use server-backed order metadata');
  const filterOptions = listLaundryOrderFilterOptions(tenant);
  assert.equal(filterOptions.sources.includes('By Store'), true, 'order filter options expose only persisted order sources');
  assert.equal(filterOptions.reporters.includes('test@epic.local'), true, 'order filter options expose persisted reporting users');

  transitionLaundryOrder(tenant, 'test@epic.local', result.order.id, 'In Process');
  assert.throws(() => transitionLaundryOrder(tenant, 'test@epic.local', result.order.id, 'Ready'), /assembly incomplete/, 'final Ready transition blocks incomplete tracked-piece assembly');
  for (const unit of result.garmentUnits) {
    for (const nextState of ['Sorted', 'Processing', 'QC', 'Assembly', 'Racked'] as const) {
      scanLaundryGarment(tenant, 'test@epic.local', { tagCode: unit.tagCode, nextState, location: nextState === 'Racked' ? `RACK-TEST-${unit.sequence}` : `${nextState} station`, note: 'Assembly safety fixture' });
    }
  }
  transitionLaundryOrder(tenant, 'test@epic.local', result.order.id, 'Ready');
  const doneStatus = listLaundryOrderPage(tenant, { search: 'Asha Verma', status: 'done', page: 1, pageSize: 10 });
  assert.equal(doneStatus.items.some((order) => order.id === result.order.id), true, 'source Done filter maps to Epic Ready orders');
  assert.throws(() => transitionLaundryOrder(tenant, 'test@epic.local', result.order.id, 'Out for Delivery'), /assign a delivery rider/, 'delivery cannot be dispatched without a rider');
  const rider = createLaundryRider(tenant, 'test@epic.local', { name: 'Mohan Rider', phone: '9000000002' });
  const assigned = assignLaundryOrder(tenant, 'test@epic.local', result.order.id, { stage: 'delivery', riderId: rider.id, slot: '4:00 PM - 6:00 PM' });
  assert.equal(assigned.deliveryRider?.name, 'Mohan Rider', 'delivery assignment persists on the order');
  const settlement = saveLaundryRiderSettlement(tenant, 'test@epic.local', { rider: rider.id, amount: 20, method: 'Cash', orderIds: [result.order.id] });
  assert.equal(settlement.status, 'Pending', 'rider collection settlement records an outstanding handover');
  saveLaundryRiderSettlement(tenant, 'test@epic.local', { status: 'Handed Over', reference: 'HAND-001' }, settlement.id);
  const reconciled = saveLaundryRiderSettlement(tenant, 'test@epic.local', { status: 'Reconciled' }, settlement.id);
  assert.equal(reconciled.status, 'Reconciled', 'rider settlement history supports reconciliation');
  assert.throws(() => saveLaundryRiderSettlement(tenant, 'test@epic.local', { amount: 25 }, settlement.id), /immutable/, 'reconciled rider settlements cannot be edited in place');
  assert.equal(listLaundryRiderSettlements(tenant, { rider: rider.id }).length, 1, 'rider settlement history is queryable by rider');
  assert.equal(laundryDispatch(tenant).deliveries.length, 1, 'ready orders appear in the delivery dispatch queue');
  transitionLaundryOrder(tenant, 'test@epic.local', result.order.id, 'Out for Delivery');
  const delivered = transitionLaundryOrder(tenant, 'test@epic.local', result.order.id, 'Delivered');
  assert.equal(delivered.state, 'Delivered', 'valid lifecycle transitions are enforced and persisted');
  assert.throws(() => transitionLaundryOrder(tenant, 'test@epic.local', result.order.id, 'Booked'), /cannot move/, 'terminal orders cannot return to booking');

  const editable = bookLaundryOrder(tenant, 'test@epic.local', {
    customer: { name: 'Editable Customer', phone: '98765 43212' },
    items: [{ garment: shirt.id, service: steamIron.id, qty: 1 }], expectedDeliveryDate: '2026-08-31', fulfillmentMode: 'Pickup Order', paymentMode: 'Pay Later',
  });
  const bookingQueue = listLaundryOrderPage(tenant, { queue: 'booking', page: 1, pageSize: 50 });
  assert.equal(bookingQueue.items.some((order) => order.id === editable.order.id), true, 'dashboard booking links resolve to booked orders');
  const pickupQueue = listLaundryOrderPage(tenant, { queue: 'pickup-unassigned', page: 1, pageSize: 50 });
  assert.equal(pickupQueue.items.some((order) => order.id === editable.order.id), true, 'dashboard pickup queue resolves to unassigned pickup orders');
  const originalEditableInvoice = String(store.getRow(tenant, editable.order.id)?.data.invoice || '');
  const edited = editLaundryOrder(tenant, 'test@epic.local', editable.order.id, {
    items: [{ garment: shirt.id, service: steamIron.id, qty: 2 }], expectedDeliveryDate: '2026-09-01', fulfillmentMode: 'Pickup Order', charges: 0, discounts: 0, taxRate: 5,
  });
  assert.equal(edited.itemCount, 2, 'controlled order edit recalculates item quantity');
  assert.equal(edited.grandTotal, 33.6, 'controlled order edit recalculates the authoritative total');
  assert.equal(store.getRow(tenant, originalEditableInvoice)?.status, 'Cancelled', 'controlled edit preserves the original invoice as cancelled history');
  assert.equal(store.getRow(tenant, edited.invoiceNumber || '')?.status, 'Submitted', 'controlled edit creates a submitted replacement invoice');
  const combinedStatus = listLaundryOrderPage(tenant, { status: 'delivered,booked', page: 1, pageSize: 50 });
  assert.equal(combinedStatus.items.some((order) => order.id === result.order.id), true, 'multi-select Delivered branch returns Delivered orders');
  assert.equal(combinedStatus.items.some((order) => order.id === edited.id), true, 'multi-select Booked branch returns Booked orders');
  assert.equal(listLaundryOrderPage(tenant, { status: 'booked,unknown-status', page: 1, pageSize: 50 }).total, 0, 'multi-select status filter fails closed if it contains an unknown value');

  const pickupStatusOrder = bookLaundryOrder(tenant, 'test@epic.local', {
    customer: { name: 'Pickup Filter Customer', phone: '98765 43213' },
    items: [{ garment: shirt.id, service: steamIron.id, qty: 1 }], expectedDeliveryDate: '2026-09-02', fulfillmentMode: 'Pickup Order', paymentMode: 'Pay Later',
  });
  assignLaundryOrder(tenant, 'test@epic.local', pickupStatusOrder.order.id, { stage: 'pickup', riderId: rider.id, slot: '10:00 AM - 12:00 PM' });
  const pickupAssignedStatus = listLaundryOrderPage(tenant, { status: 'pickup-assigned', page: 1, pageSize: 10 });
  assert.equal(pickupAssignedStatus.items.some((order) => order.id === pickupStatusOrder.order.id), true, 'Pickup Assigned filter uses the assigned rider and open pickup state');
  transitionLaundryOrder(tenant, 'test@epic.local', pickupStatusOrder.order.id, 'Picked Up');
  const pickupReceivedStatus = listLaundryOrderPage(tenant, { status: 'pickup-received', page: 1, pageSize: 10 });
  assert.equal(pickupReceivedStatus.items.some((order) => order.id === pickupStatusOrder.order.id), true, 'source Pickup Received filter maps to Epic Picked Up orders');

  const partialDeliveryOrder = bookLaundryOrder(tenant, 'test@epic.local', {
    customer: { name: 'Partial Delivery Filter Customer', phone: '98765 43214' },
    items: [{ garment: shirt.id, service: steamIron.id, qty: 2 }], expectedDeliveryDate: '2026-09-03', fulfillmentMode: 'Home Delivery', paymentMode: 'Pay Later',
  });
  recordLaundryFulfillment(tenant, 'test@epic.local', partialDeliveryOrder.order.id, { itemIndex: 0, stage: 'Delivered', quantity: 1, note: 'Partial delivery filter fixture' });
  const partiallyDeliveredStatus = listLaundryOrderPage(tenant, { status: 'partially-delivered', page: 1, pageSize: 10 });
  assert.equal(partiallyDeliveredStatus.items.some((order) => order.id === partialDeliveryOrder.order.id), true, 'Partially Delivered filter compares submitted item quantities');
  const pendingPartialDeliveryStatus = listLaundryOrderPage(tenant, { status: 'partially-delivered', queue: 'pending', page: 1, pageSize: 10 });
  assert.equal(pendingPartialDeliveryStatus.items.some((order) => order.id === partialDeliveryOrder.order.id), true, 'partial-delivery filtering remains consistent with dashboard queues');

  const cancellable = bookLaundryOrder(tenant, 'test@epic.local', {
    customer: { name: 'Cancellation Customer', phone: '98765 43211' },
    items: [{ garment: shirt.id, service: steamIron.id, qty: 1 }], expectedDeliveryDate: '2026-08-31', fulfillmentMode: 'Pickup Order', paymentMode: 'Cash', taxRate: 5,
  });
  const dashboardBeforeCancellation = laundryDashboard(tenant);
  const growthBeforeCancellation = laundryReportDetail(tenant, 'growth').rows[0] as { tax: number };
  const cancelledOrder = cancelLaundryOrder(tenant, 'test@epic.local', cancellable.order.id, 'Customer requested cancellation');
  const cancellableInvoiceId = String(store.getRow(tenant, cancellable.order.id)?.data.invoice || '');
  assert.equal(cancelledOrder.state, 'Cancelled', 'order cancellation requires a reason and persists terminal state');
  assert.equal(store.getRow(tenant, cancellable.order.id)?.status, 'Cancelled', 'cancelled order remains in history');
  assert.equal(store.getRow(tenant, cancellable.receipt.invoiceNumber)?.status, 'Cancelled', 'cancellation reverses the linked invoice');
  assert.equal(store.rowsOf(tenant, 'payment_entry').some((row) => row.status === 'Cancelled' && row.data.against_sales === cancellableInvoiceId), true, 'cancellation reverses submitted payment evidence against the invoice');
  assert.equal(store.rowsOf(tenant, 'laundry_customer_ledger').some((row) => row.data.entry_type === 'Adjustment' && String(row.data.reason).includes('Invoice reversal')), true, 'cancellation posts a customer invoice reversal adjustment');

  const expense = createLaundryExpense(tenant, 'test@epic.local', {
    expenseName: 'Steam press repair', expenseDate: '2026-08-29', amount: 1250, paymentReceiver: 'Repair vendor', paymentMode: 'UPI', isTaxPaid: true,
  });
  assert.equal(expense.amount, 1250, 'store expenses persist with their payment metadata');
  const expenseReport = laundryReportDetail(tenant, 'expense', '2026-08-29', '2026-08-29');
  assert.deepEqual(expenseReport.columns, ['title', 'expenseAmount', 'taxAmount', 'amountBeforeTax'], 'expense report matches the observed title and three amount columns');
  assert.deepEqual(expenseReport.rows, [{ title: 'Saturday', expenseAmount: 1250, taxAmount: null, amountBeforeTax: null }], 'expense report keeps unavailable tax separate instead of guessing it from the tax-paid flag');
  assert.deepEqual(expenseReport.summary, { label: 'Total Expense', value: 1250, format: 'currency' }, 'expense report totals the selected period expense amount');
  const emptyExpenseReport = laundryReportDetail(tenant, 'expense', '1999-01-01', '1999-01-01');
  assert.deepEqual(emptyExpenseReport.columns, expenseReport.columns, 'empty expense report preserves its source-shaped columns');
  assert.deepEqual(emptyExpenseReport.rows, [{ title: 'Friday', expenseAmount: 0, taxAmount: 0, amountBeforeTax: 0 }], 'empty expense dates show zero amount rows');
  assert.deepEqual(emptyExpenseReport.summary, { label: 'Total Expense', value: 0, format: 'currency' }, 'empty expense report has a zero total');
  const searchedExpenseReport = laundryReportDetail(tenant, 'expense', '2026-08-29', '2026-08-29', 'repair');
  assert.equal(searchedExpenseReport.summary?.value, 1250, 'expense report searches the expense name before daily aggregation');
  const expenseChart = laundryReportChart(tenant, 'expense', '2026-08-29', '2026-08-29');
  assert.deepEqual(expenseChart.points, [{ label: '2026-08-29', value: 1250 }], 'expense chart groups expense amount by posting date');
  assert.equal(listLaundryExpenses(tenant, { from: '2026-08-29', to: '2026-08-29' }).some((row) => row.id === expense.id), true, 'expense ledger date filters use the server-backed expense date');
  assert.equal(listLaundryExpenses(tenant, { from: '2026-08-30' }).some((row) => row.id === expense.id), false, 'expense ledger date filters exclude rows outside the selected range');
  assert.equal(listLaundryExpenses(tenant, { search: 'repair vendor' }).some((row) => row.id === expense.id), true, 'expense ledger search matches receiver names without changing the stored record');
  assert.equal(listLaundryExpenses(tenant, { search: 'missing expense phrase' }).some((row) => row.id === expense.id), false, 'expense ledger search returns no unrelated rows');
  assert.equal(store.rowsOf(tenant, 'journal_entry').length, 1, 'an expense posts a balanced journal entry');
  const editedExpense = editLaundryExpense(tenant, 'test@epic.local', expense.id, {
    expenseName: 'Steam press repair', expenseDate: '2026-08-29', amount: 1350, paymentReceiver: 'Repair vendor', paymentMode: 'UPI', isTaxPaid: true,
  }, 'Corrected vendor invoice');
  assert.equal(editedExpense.amount, 1350, 'controlled expense edit replaces the authoritative amount');
  assert.equal(store.rowsOf(tenant, 'journal_entry').filter((row) => row.status === 'Submitted').length, 1, 'controlled expense edit leaves one submitted journal');
  assert.equal(store.rowsOf(tenant, 'journal_entry').filter((row) => row.status === 'Cancelled').length, 1, 'controlled expense edit preserves the original journal as cancelled history');
  const report = laundryReports(tenant);
  assert.equal(report.summary.expenses, 1350, 'reports include the edited posted store expense');
  assert.equal(report.trend.length, 7, 'reports expose a seven-day trend by default');
  assert.equal(report.fulfillmentBreakdown.some((row) => row.mode === 'Home Delivery' && row.count >= 1), true, 'reports group fulfilment modes');
  assert.equal(report.topGarments[0]?.name, 'Shirt / T-shirt', 'reports rank processed garments');
  const reportKinds = ['invoice', 'collection', 'order', 'consolidated-invoices', 'customer', 'customer-package', 'customer-list', 'growth', 'discount', 'expense', 'balance', 'pickup', 'rider-delivery', 'rider-collection', 'warehouse-user-work'] as const;
  for (const kind of reportKinds) assert.equal(laundryReportDetail(tenant, kind).kind, kind, `${kind} report has a distinct server-backed query`);
  assert.equal(isLaundryReportLocked('warehouse-user-work'), true, 'warehouse work report requires activation like the audited source');
  assert.equal(isLaundryReportLocked('pickup'), false, 'other operational report routes remain available');
  const todayStats = laundryStatistics(tenant, 'today');
  const weekStats = laundryStatistics(tenant, 'week');
  const lifetimeStats = laundryStatistics(tenant, 'lifetime');
  assert.equal(todayStats.from, todayStats.to, 'today statistics use a single-day range');
  assert.equal(todayStats.ordersReview.breakdown.reduce((sum: number, row: { count: number }) => sum + row.count, 0), todayStats.ordersReview.total, 'statistics lifecycle buckets reconcile to the active-order total');
  assert.equal(weekStats.collection.daily.length, 7, 'week statistics expose seven collection points');
  assert.equal(weekStats.newCustomer.daily.length, 7, 'week statistics expose seven acquisition points');
  assert.equal(lifetimeStats.period, 'lifetime', 'lifetime statistics preserve the requested range');
  assert.equal(lifetimeStats.revenue.total >= weekStats.revenue.total, true, 'lifetime revenue includes the active historical range');
  const independentStats = laundryStatistics(tenant, {
    ordersReview: { period: 'today' },
    collection: { period: 'custom', from: '1999-01-01', to: '1999-01-03' },
    customerFrequency: { period: 'month' },
    newCustomer: { period: 'year' },
  });
  assert.deepEqual(Object.fromEntries(Object.entries(independentStats.ranges).map(([key, range]) => [key, range.period])), {
    ordersReview: 'today', collection: 'custom', customerFrequency: 'month', newCustomer: 'year',
  }, 'Overview sections retain separate date presets');
  assert.equal(independentStats.collection.daily.length, 3, 'custom collection window returns only its selected date span');
  assert.throws(() => laundryStatistics(tenant, { collection: { period: 'custom', from: '2026-02-31', to: '2026-03-01' } }), /valid custom start and end date/, 'invalid custom statistics dates are rejected');
  const cancelledExpense = cancelLaundryExpense(tenant, 'test@epic.local', expense.id, 'Duplicate entry corrected');
  assert.equal(cancelledExpense.status, 'Cancelled', 'expense cancellation preserves the record with a controlled status');
  const postCancellationReport = laundryReports(tenant);
  assert.equal(postCancellationReport.summary.expenses, 0, 'cancelled expenses are excluded from operating totals');
  assert.equal(postCancellationReport.paymentBreakdown.find((row) => row.paymentMode === 'Cash')?.count, 0, 'cancelled orders are excluded from payment mix totals');
  const dashboardAfterCancellation = laundryDashboard(tenant);
  assert.equal(Math.round((dashboardBeforeCancellation.kpis.todayRevenue - dashboardAfterCancellation.kpis.todayRevenue) * 100) / 100, cancellable.order.grandTotal, 'dashboard today revenue excludes cancelled orders');
  assert.equal(laundryReportDetail(tenant, 'balance').rows.some((row: any) => row.orderNumber === cancellable.order.orderNumber), false, 'balance report excludes cancelled orders from receivables');
  const growthAfterCancellation = laundryReportDetail(tenant, 'growth').rows[0] as { tax: number };
  assert.equal(Math.round((growthBeforeCancellation.tax - growthAfterCancellation.tax) * 100) / 100, cancellable.order.taxAmount, 'growth tax excludes cancelled orders');

  const partyCountBeforePreview = store.rowsOf(tenant, 'party').length;
  const jobsCountBeforePreview = store.rowsOf(tenant, 'laundry_import_job').length;
  const customerPreview = previewLaundryImport(tenant, 'customers', [
    { name: 'Preview Customer', phone: '9000000456' },
    { name: '', phone: '123' },
  ]);
  assert.deepEqual(customerPreview, {
    totalRows: 2, readyRows: 1, errors: [{ row: 3, message: 'customer name is required' }],
  }, 'customer preflight reports worksheet row and blocks invalid rows before commit');
  assert.equal(store.rowsOf(tenant, 'party').length, partyCountBeforePreview, 'customer preflight creates no customer rows');
  assert.equal(store.rowsOf(tenant, 'laundry_import_job').length, jobsCountBeforePreview, 'customer preflight creates no durable import job');

  const priceCountsBeforePreview = ['laundry_category', 'laundry_service', 'laundry_garment', 'laundry_price', 'laundry_import_job']
    .map((entity) => store.rowsOf(tenant, entity).length);
  const pricePreview = previewLaundryImport(tenant, 'prices', [
    { garmentName: shirt.name, categoryName: shirt.categoryName, serviceName: steamIron.name, rate: 11, unit: 'Piece' },
    { garmentName: 'New garment without an approved visual', categoryName: 'New category', serviceName: 'New service', rate: 5 },
    { garmentName: shirt.name, categoryName: shirt.categoryName, serviceName: steamIron.name, rate: -1, unit: 'Piece' },
  ]);
  assert.deepEqual(pricePreview, {
    totalRows: 3,
    readyRows: 1,
    errors: [
      { row: 3, message: 'Create this garment in Garments first, or add an approved Visual Key before importing its price' },
      { row: 4, message: 'rate cannot be negative' },
    ],
  }, 'price preflight checks catalogue references and invalid amounts before commit');
  assert.deepEqual(
    ['laundry_category', 'laundry_service', 'laundry_garment', 'laundry_price', 'laundry_import_job'].map((entity) => store.rowsOf(tenant, entity).length),
    priceCountsBeforePreview,
    'price preflight creates no catalogue records, prices, or import jobs',
  );

  const customerImport = importLaundryCustomers(tenant, 'test@epic.local', [
    { name: 'Imported Customer', phone: '9810146062', email: 'imported@example.test', address: 'Import street' },
  ]);
  assert.equal(customerImport.created, 1, 'customer imports create a reusable customer record');
  const priceImport = importLaundryPrices(tenant, 'test@epic.local', [
    { garmentName: 'Imported blazer', categoryName: 'Men\'s Wear', serviceName: 'Dry Cleaning', rate: 450, unit: 'Piece', customerPhone: '9810146062', visualKey: 'foldedBlazer', photo: '/ui/app/garments/optimized/lndry-folded-blazer-v1.webp' },
  ]);
  assert.equal(priceImport.created, 1, 'price imports create a scoped garment and service rate');
  assert.equal(laundryCatalogue(tenant).prices.some((price) => price.garmentName === 'Imported blazer' && Number((price as { rate?: number }).rate) === 450), true, 'imported prices are available to the counter catalogue');

  const regressionFixture = createLaundryRegressionFixture('FIXTURE');
  assert.equal(regressionFixture.paid.order.paymentStatus, 'Paid', 'repeatable fixture includes a paid order');
  assert.equal(regressionFixture.unpaid.order.paymentStatus, 'Unpaid', 'repeatable fixture includes an unpaid order');
  assert.ok(regressionFixture.rider.id, 'repeatable fixture includes a rider');
  assert.equal(regressionFixture.expense.amount, 250, 'repeatable fixture includes an expense');

  const atomicTenant = 'ATOMIC';
  seedLaundryDefaults(atomicTenant);
  const atomicCatalogue = laundryCatalogue(atomicTenant);
  const atomicGarment = atomicCatalogue.garments.find((garment: any) => garment.name === 'Shirt / T-shirt')!;
  const atomicService = atomicCatalogue.services.find((service: any) => service.name === 'Steam Iron')!;
  process.env.EPIC_TEST_BOOKING_FAIL_AT = 'after-invoice';
  assert.throws(() => bookLaundryOrder(atomicTenant, 'test@epic.local', {
    customer: { name: 'Atomic rollback', phone: '9000000111' },
    items: [{ garment: atomicGarment.id, service: atomicService.id, qty: 1 }],
    expectedDeliveryDate: '2026-09-03', fulfillmentMode: 'Home Delivery', paymentMode: 'Cash',
  }), /forced booking failure/, 'forced mid-booking failure is surfaced');
  delete process.env.EPIC_TEST_BOOKING_FAIL_AT;
  assert.equal(store.rowsOf(atomicTenant, 'sales_invoice').length, 0, 'atomic booking rollback leaves no invoice');
  assert.equal(store.rowsOf(atomicTenant, 'payment_entry').length, 0, 'atomic booking rollback leaves no payment');
  assert.equal(store.rowsOf(atomicTenant, 'laundry_order').length, 0, 'atomic booking rollback leaves no order');

  console.log('PASS  laundry vertical slice self-test complete');
} finally {
  closeStore?.();
  rmSync(tempDir, { recursive: true, force: true });
}
