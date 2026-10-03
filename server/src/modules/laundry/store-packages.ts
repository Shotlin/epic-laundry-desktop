import { randomUUID } from 'node:crypto';
import { audit } from '../../kernel/audit.js';
import { store } from '../../kernel/store.js';
import { parseMoney } from '../../kernel/money.js';
import { listLaundryServices } from './domain.js';

export type StorePackageServiceLimitInput = {
  serviceId: string;
  quantityLimit: number | string;
  amountLimit: number | string;
};

export type StorePackageInput = {
  name?: unknown;
  amount?: unknown;
  serviceIds?: unknown;
  limitsEnabled?: unknown;
  serviceLimits?: unknown;
};

export function listStorePackages(tenant: string, storeId = store.currentStore(tenant)) {
  return store.getStoreSettings(tenant, storeId).storePackages
    .map((item) => ({ ...item, services: item.services.map((service) => ({ ...service })), serviceLimits: item.serviceLimits.map((limit) => ({ ...limit })) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.createdAt.localeCompare(b.createdAt));
}

export function createStorePackage(tenant: string, actor: string, input: StorePackageInput, storeId = store.currentStore(tenant)) {
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Package Name is required');
  if (name.length > 100) throw new Error('Package Name must be 100 characters or fewer');
  const amount = parseMoney(input.amount, 'Amount', { allowZero: true }) / 100;
  if (!Array.isArray(input.serviceIds)) throw new Error('Select package services using the service list');
  const serviceIds = input.serviceIds.map((value) => String(value ?? '').trim());
  if (serviceIds.some((id) => !id)) throw new Error('Package service IDs cannot be empty');
  if (new Set(serviceIds).size !== serviceIds.length) throw new Error('A service can only be selected once');

  const availableServices = listLaundryServices(tenant).filter((service) => service.active !== false);
  const serviceById = new Map(availableServices.map((service) => [service.id, String(service.name || '').trim()]));
  const services = serviceIds.map((id) => {
    const serviceName = serviceById.get(id);
    if (!serviceName) throw new Error('One or more selected services are no longer available. Refresh the service list and try again.');
    return { id, name: serviceName };
  });

  const limitsEnabled = input.limitsEnabled === true;
  if (input.serviceLimits != null && !Array.isArray(input.serviceLimits)) throw new Error('Service-wise limits must be a list');
  const rawLimits = (Array.isArray(input.serviceLimits) ? input.serviceLimits : []) as StorePackageServiceLimitInput[];
  const serviceLimits = rawLimits.map((limit) => {
    const serviceId = String(limit?.serviceId ?? '').trim();
    if (!limitsEnabled || !serviceIds.includes(serviceId)) throw new Error('Service-wise limits must match selected package services');
    const rawQuantityLimit = typeof limit.quantityLimit === 'number' && Number.isFinite(limit.quantityLimit) ? limit.quantityLimit.toString() : String(limit.quantityLimit ?? '').trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(rawQuantityLimit)) throw new Error('Quantity Limit must be a non-negative number with at most three decimal places');
    const quantityLimit = Number(rawQuantityLimit);
    if (!Number.isSafeInteger(Math.round(quantityLimit * 1000))) throw new Error('Quantity Limit is outside the supported range');
    const amountLimit = parseMoney(limit.amountLimit, 'Amount Limit', { allowZero: true }) / 100;
    return { serviceId, quantityLimit: Math.round(quantityLimit * 1000) / 1000, amountLimit };
  });
  if (limitsEnabled && serviceLimits.length !== services.length) throw new Error('Add a Quantity Limit and Amount Limit for every selected service');
  if (!limitsEnabled && serviceLimits.length) throw new Error('Service-wise limits must be enabled before they can be saved');
  if (new Set(serviceLimits.map((limit) => limit.serviceId)).size !== serviceLimits.length) throw new Error('Each service can have only one limit group');

  const settings = store.getStoreSettings(tenant, storeId);
  if (settings.storePackages.length >= 500) throw new Error('This branch already has the maximum of 500 Store Packages');
  const record = {
    id: `sp_${randomUUID()}`,
    name,
    amount,
    services,
    limitsEnabled,
    serviceLimits,
    createdAt: new Date().toISOString(),
  };
  store.saveStoreSettings(tenant, actor, { storePackages: [...settings.storePackages, record] }, storeId);
  audit(tenant, actor, 'settings:store-package-created', {
    entity: 'store_settings', row_id: storeId,
    after: { id: record.id, name: record.name, amount: record.amount, services: record.services, limitsEnabled: record.limitsEnabled, serviceLimits: record.serviceLimits },
  });
  return record;
}
