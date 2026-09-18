import { randomUUID } from 'node:crypto';
import { store } from './store.js';
import type { OutboxEvent } from './types.js';

// In-process event bus backed by a transactional outbox (docs/02-architecture/01-tech-stack.md §5).
// External consumers (webhooks, search indexer, AI jobs) are served by the outbox relay; internal
// automation subscribers run here synchronously after publish().

type Handler = (e: OutboxEvent) => Promise<void> | void;
const subs: { type: string; h: Handler }[] = [];

export function subscribe(type: string, h: Handler) {
  subs.push({ type, h });
}

export function publish(tenant: string, type: string, payload: any): OutboxEvent {
  const e: OutboxEvent = {
    id: randomUUID(),
    tenant,
    type,
    payload,
    created_at: new Date().toISOString(),
    published: false,
  };
  store.appendOutbox(e);
  // fire internal subscribers (best-effort; never block the request on automation failures)
  for (const s of subs) {
    if (s.type === type || s.type === '*') {
      Promise.resolve()
        .then(() => s.h(e))
        .catch((err) => console.error(`[eventbus] subscriber ${s.type} failed:`, err));
    }
  }
  return e;
}

// Relay for external consumers: returns unpublished events and marks them published.
export function drainOutbox(tenant: string) {
  const pending = store.outboxUnpublished(tenant);
  for (const e of pending) store.markPublished(e.id);
  return pending;
}
