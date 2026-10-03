export type UiPermission =
  | 'orders.read'
  | 'orders.edit'
  | 'orders.create'
  | 'orders.transition'
  | 'expenses.create'
  | 'reports.read'
  | 'settings.manage'
  | 'catalogue.read'
  | 'catalogue.manage'
  | 'customers.read'
  | 'customers.create'
  | 'customers.edit'
  | 'wallet.manage'
  | 'rewards.manage'
  | 'packages.read'
  | 'packages.manage'
  | 'packages.sell'
  | 'packages.redeem'
  | 'garments.read'
  | 'cash.read'
  | 'production.read'
  | 'production.start'
  | 'production.assign'
  | 'quality.read'
  | 'quality.open'
  | 'quality.resolve'
  | 'routes.read'
  | 'payments.collect'
  | 'payments.refund'

const rolePermissions: Record<string, UiPermission[]> = {
  counter_staff: ['orders.read', 'orders.edit', 'orders.create', 'payments.collect', 'expenses.create', 'catalogue.read', 'customers.read', 'customers.create', 'customers.edit', 'packages.read', 'packages.sell', 'packages.redeem', 'garments.read', 'cash.read', 'production.read', 'quality.read', 'quality.open', 'routes.read'],
  processing_staff: ['orders.read', 'orders.transition', 'catalogue.read', 'packages.read', 'packages.redeem', 'garments.read', 'production.read', 'production.assign', 'production.start', 'quality.read', 'quality.open', 'quality.resolve', 'routes.read'],
  rider: ['routes.read'],
}

export function canUseUi(roles: string[] | undefined, permission: UiPermission) {
  if (roles?.includes('owner')) return true
  return roles?.some((role) => rolePermissions[role]?.includes(permission)) || false
}
