import { audit } from '../../kernel/audit.js';
import { store } from '../../kernel/store.js';

export const LAUNDRY_MESSAGE_PLACEHOLDERS = [
  'Brand', 'CustomerName', 'CustomerPhone', 'OrderNo', 'InvoiceNo', 'OrderDate', 'DeliveryDate',
  'TotalGarments', 'TotalAmount', 'Paid', 'Balance', 'OverallPendingAmount', 'Remarks',
  'StainDetails', 'PackageDetails', 'InvoiceUrl', 'ImageDownloadPage', 'TrackOrderUrl', 'ReviewSection', 'TeamName',
] as const;

export type LaundryMessageTemplateKey = 'order-booked' | 'order-processing' | 'order-done' | 'order-delivered';
export type LaundryMessageTemplate = {
  key: LaundryMessageTemplateKey;
  label: string;
  body: string;
  active: boolean;
  updatedAt?: string;
};

const DEFAULT_TEMPLATES: LaundryMessageTemplate[] = [
  {
    key: 'order-booked', label: 'Order Booked', active: true,
    body: 'Hello {CustomerName}, your Epic Laundry order #{OrderNo} has been booked.\n\nItems: {TotalGarments}\nAmount: {TotalAmount}\nExpected delivery: {DeliveryDate}\n\nWe will keep you updated as your order moves through the laundry.',
  },
  {
    key: 'order-processing', label: 'Order Processing', active: true,
    body: 'Hello {CustomerName}, we have started processing your Epic Laundry order #{OrderNo}. We will message you when it is ready.',
  },
  {
    key: 'order-done', label: 'Order Done', active: true,
    body: 'Hello {CustomerName}, your Epic Laundry order #{OrderNo} is ready for collection.\n\nItems: {TotalGarments}\nBalance due: {Balance}\n\nThank you for choosing {Brand}.',
  },
  {
    key: 'order-delivered', label: 'Order Delivered', active: true,
    body: 'Hello {CustomerName}, your Epic Laundry order #{OrderNo} has been delivered. Thank you for choosing {Brand}.',
  },
];

export function listLaundryMessageTemplates(tenant: string): LaundryMessageTemplate[] {
  const saved = store.getStoreSettings(tenant).messageTemplates || [];
  return DEFAULT_TEMPLATES.map((template) => {
    const override = saved.find((item) => item.key === template.key);
    return override ? { ...template, body: override.body, active: override.active, updatedAt: override.updatedAt } : { ...template };
  });
}

export function saveLaundryMessageTemplate(tenant: string, actor: string, key: string, body: unknown) {
  const current = listLaundryMessageTemplates(tenant);
  const template = current.find((item) => item.key === key);
  if (!template) throw new Error('MESSAGE_TEMPLATE_UNKNOWN');
  const nextBody = String(body ?? '').trim();
  if (!nextBody) throw new Error('MESSAGE_TEMPLATE_REQUIRED');
  if (nextBody.length > 4000) throw new Error('MESSAGE_TEMPLATE_TOO_LONG');
  const unsupported = [...new Set(Array.from(nextBody.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g), (match) => match[1]))]
    .filter((name) => !LAUNDRY_MESSAGE_PLACEHOLDERS.includes(name as (typeof LAUNDRY_MESSAGE_PLACEHOLDERS)[number]));
  if (unsupported.length) throw new Error(`MESSAGE_TEMPLATE_PLACEHOLDER_UNKNOWN: ${unsupported.join(', ')}`);
  const updatedAt = new Date().toISOString();
  const next = current.map((item) => item.key === key ? { ...item, body: nextBody, active: true, updatedAt } : item);
  store.saveStoreSettings(tenant, actor, { messageTemplates: next.map(({ key: itemKey, body: itemBody, active, updatedAt: time }) => ({ key: itemKey, body: itemBody, active, updatedAt: time })) });
  audit(tenant, actor, 'settings:laundry-message-template-updated', { entity: 'laundry_message_template', row_id: key, after: { bodyLength: nextBody.length, active: true, updatedAt } });
  return next.find((item) => item.key === key)!;
}

export function setLaundryMessageTemplateActive(tenant: string, actor: string, key: string, active: boolean) {
  const current = listLaundryMessageTemplates(tenant);
  if (!current.some((item) => item.key === key)) throw new Error('MESSAGE_TEMPLATE_UNKNOWN');
  const updatedAt = new Date().toISOString();
  const next = current.map((item) => item.key === key ? { ...item, active, updatedAt } : item);
  store.saveStoreSettings(tenant, actor, { messageTemplates: next.map(({ key: itemKey, body, active: isActive, updatedAt: time }) => ({ key: itemKey, body, active: isActive, updatedAt: time })) });
  audit(tenant, actor, active ? 'settings:laundry-message-template-restored' : 'settings:laundry-message-template-archived', {
    entity: 'laundry_message_template', row_id: key, after: { active, updatedAt },
  });
  return next.find((item) => item.key === key)!;
}
