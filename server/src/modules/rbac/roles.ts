// Role-Based Access Control: evaluate an action against an entity's per-role permission matrix.
export type RbacAction = 'read' | 'write' | 'submit' | 'cancel';

export const ROLES = ['admin', 'accountant', 'sales', 'cashier', 'viewer'] as const;
export type Role = typeof ROLES[number];

// An entity def carries `permissions: [{ role, read, write, submit, cancel }]`.
// `admin` is the implicit superuser when a role has no explicit rule.
export function roleCan(role: string, action: RbacAction, def: { permissions?: { role: string; read?: boolean; write?: boolean; submit?: boolean; cancel?: boolean }[] }): boolean {
  if (role === 'admin') return true;
  const p = (def.permissions || []).find((x) => x.role === role);
  if (!p) return false;
  return !!p[action];
}

export function defaultPermissions(): { role: Role; read: boolean; write: boolean; submit: boolean; cancel: boolean }[] {
  return (ROLES as readonly Role[]).map((role) => ({
    role,
    read: true,
    write: role !== 'viewer',
    submit: role === 'admin' || role === 'accountant' || role === 'sales' || role === 'cashier',
    cancel: role === 'admin' || role === 'accountant',
  }));
}
