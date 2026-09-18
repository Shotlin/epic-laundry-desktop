import { randomUUID } from 'node:crypto';
import { store } from './store.js';
import type { AuditEntry } from './types.js';

export function audit(tenant: string, actor: string, action: string, opts: Partial<AuditEntry> = {}) {
  const e: AuditEntry = {
    id: randomUUID(),
    tenant,
    ts: new Date().toISOString(),
    actor,
    action,
    ...opts,
  };
  store.appendAudit(e);
  return e;
}
