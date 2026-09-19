// Web-deployment client: calls the real LNDRY backend (api.lndry.in)
// directly with a Bearer token, instead of the local desktop server this
// file originally talked to via a same-origin cookie session. See
// cloudAuth.ts for the login/token-refresh flow this depends on.
//
// Response-shape note: every /api/v1/vendor/* route on the real backend
// wraps its payload as {success, message, data, code?}, not the bare JSON
// object the local desktop server returned — apiGet/apiPost/etc. below
// unwrap `.data` automatically so callers keep working with the same
// destructuring shape as before, as long as the endpoint itself was
// adapted to the real backend's paths (see each page for that mapping).
import { CLOUD_API_BASE, readStoredSession, refreshStoredSession, clearStoredSession, isWebOnly, sessionFromStoredCloud } from './cloudAuth'
import { matchAdapter, type Real } from './webAdapters/core'
import './webAdapters'

const BASE = CLOUD_API_BASE;

type RequestOptions = { idempotencyKey?: string };

const idempotencyKey = () => crypto.randomUUID();
const notifyUnauthorized = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('epic-auth-expired'));
};
// A 401 from the marketplace cloud connector (`code: 'CLOUD_AUTH_FAILED'`,
// e.g. wrong OTP, or a dead connector token the server couldn't refresh)
// means the REMOTE marketplace session is the thing that's invalid — not
// the operator's own Desktop login. Treating every 401 the same forced the
// whole app into "Your session expired, sign in again" over a marketplace
// hiccup unrelated to the operator's own session (caught live: a stale
// connector token on the online-orders page logged the operator out of the
// entire counter workspace, not just the marketplace panel).
const notifyUnauthorizedUnlessCloud = (body: unknown) => {
  if (body && typeof body === 'object' && (body as { code?: string }).code === 'CLOUD_AUTH_FAILED') return;
  notifyUnauthorized();
};

export type OfflineQueueItem = {
  id: string;
  entity: 'laundry_order' | 'laundry_expense' | 'party';
  data: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  deadLetter?: boolean;
};

const OFFLINE_QUEUE_KEY = 'epic-laundry-offline-commands-v1';
const queueEvent = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('epic-offline-queue-changed')); };
const randomId = () => typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class OfflineQueuedError extends Error {
  readonly queued = true;
  constructor(public readonly commandId: string) { super('The connection is unavailable. This action was saved to the offline queue and will retry when it returns.'); this.name = 'OfflineQueuedError'; }
}

export class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly details?: Record<string, unknown>) { super(message); this.name = 'ApiError'; }
}

const operatorMessages: Record<string, string> = {
  TAG_NOT_FOUND: 'That tag was not found in this branch. Check the code and scan the active store tag.',
  TAG_RETIRED: 'This tag was replaced. Scan the current active tag shown in the history.',
  INVALID_GARMENT_TRANSITION: 'That garment cannot move to the selected stage from its current stage.',
  INVALID_CONTAINER_TRANSITION: 'That container cannot move to the selected stage from its current stage.',
  ASSEMBLY_INCOMPLETE: 'Assembly is blocked until every tracked garment or container reaches its required ready state.',
  STALE_ORDER_VERSION: 'This order changed in another workspace. Refresh it before trying again.',
  ORDER_NOT_FOUND: 'This order is no longer available in the active store.',
  PRINT_JOB_INVALID: 'The print request is invalid. Check the selected document, tags, and copy count.',
  PRINT_JOB_FAILED: 'The print job failed. Record the failure reason and retry from Print Centre.',
  RIDER_ONLY_ACCOUNT: 'This phone is registered as a Captain (delivery) account. Captains cannot access the store desktop app.',
  AMBIGUOUS_VENDOR_ACCOUNT: 'This phone is not recognized as a vendor account for any shop. Contact support if you believe this is wrong.',
  CLOUD_LOGIN_INPUT_REQUIRED: 'Enter your phone number and the one-time code.',
};

export function operatorErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return (error.code && operatorMessages[error.code]) || error.message || fallback;
  return error instanceof Error ? error.message || fallback : fallback;
}

function readOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string' && typeof item.entity === 'string') : [];
  } catch { return []; }
}
function writeOfflineQueue(items: OfflineQueueItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  queueEvent();
}
export function offlineQueueSnapshot() { return readOfflineQueue(); }
export function clearOfflineDeadLetters() { writeOfflineQueue(readOfflineQueue().filter((item) => !item.deadLetter)); }
export function retryOfflineDeadLetters() { writeOfflineQueue(readOfflineQueue().map((item) => item.deadLetter ? { ...item, attempts: 0, deadLetter: false, nextAttemptAt: undefined, lastError: undefined } : item)); }
export function exportOfflineQueue() { return JSON.stringify(readOfflineQueue(), null, 2); }

function isNetworkFailure(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error || '');
  return /failed to fetch|networkerror|network request failed|connection refused/i.test(message);
}

export async function apiPostOffline<T = any>(path: string, body: Record<string, unknown>, entity: OfflineQueueItem['entity']): Promise<T> {
  const idempotencyKey = randomId();
  try { return await apiPost<T>(path, body, { idempotencyKey }); }
  catch (error) {
    if (!isNetworkFailure(error)) throw error;
    const item: OfflineQueueItem = { id: randomId(), entity, data: body, idempotencyKey, createdAt: new Date().toISOString(), attempts: 0 };
    writeOfflineQueue([...readOfflineQueue(), item]);
    throw new OfflineQueuedError(item.id);
  }
}

// NOTE: unlike the local-desktop-server deployment, the real backend has no
// generic entity-sync endpoint (`/sync/push`) — this offline queue can
// still capture failed commands locally, but replaying them needs each
// command's real /api/v1/vendor/* endpoint re-called individually, not a
// bulk sync endpoint. Left as a known gap for whoever wires up true offline
// support for the web deployment; not attempted in this pass.
export async function replayOfflineQueue(_options: { force?: boolean } = {}): Promise<{ accepted: number; applied: number; failed: number; remaining: number }> {
  const current = readOfflineQueue();
  return { accepted: 0, applied: 0, failed: 0, remaining: current.length };
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const session = readStoredSession();
  return session ? { ...extra, Authorization: `Bearer ${session.accessToken}` } : extra;
}

/** Unwraps the real backend's {success, message, data, code} envelope. On a 401, tries one silent token refresh + retry before giving up — mirrors the proven pattern in epic-laundry-desktop/server's cloud-client.ts#authenticatedRequest. */
async function request<T>(path: string, init: RequestInit, retrying = false): Promise<T> {
  const res = await fetch(BASE + path, init);
  if (res.status === 401 && !retrying) {
    const refreshed = await refreshStoredSession();
    if (refreshed) {
      const nextInit: RequestInit = { ...init, headers: { ...(init.headers as Record<string, string> || {}), Authorization: `Bearer ${refreshed.accessToken}` } };
      return request<T>(path, nextInit, true);
    }
    clearStoredSession();
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    if (res.status === 401) notifyUnauthorizedUnlessCloud(body);
    const message = body?.message || body?.error?.message || `${path} -> ${res.status}`;
    recordFailure(path, res.status, message);
    throw new ApiError(message, body?.code || body?.error?.code, body?.error?.field_errors);
  }
  return (body?.data !== undefined ? body.data : body) as T;
}

// Kept so a failing call can be inspected from the browser console while the
// website build is being brought up: window.__apiFailures.
function recordFailure(path: string, status: number, message: string) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __apiFailures?: Array<{ path: string; status: number; message: string }> };
  (w.__apiFailures ||= []).push({ path, status, message });
}

const realCalls: Real = {
  get: (path) => request<any>(path, { headers: authHeaders() }),
  post: (path, body) => request<any>(path, { method: 'POST', headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : {}), body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: (path, body) => request<any>(path, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: (path, body) => request<any>(path, { method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: (path) => request<any>(path, { method: 'DELETE', headers: authHeaders() }),
};

/** Website build only: answer an old local-server path from the real backend. Returns undefined when no adapter exists (the call then goes to the real backend at its original path). */
async function viaAdapter<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: any): Promise<{ hit: boolean; value?: T }> {
  if (!isWebOnly) return { hit: false };
  const found = matchAdapter(method, path);
  if (!found) return { hit: false };
  let value: unknown;
  try { value = await found.fn({ ...realCalls, params: found.params, query: found.query, body }); }
  catch (error) { recordFailure(`${method} ${path} (adapter)`, 0, error instanceof Error ? error.message : String(error)); throw error; }
  return { hit: true, value: value as T };
}

export async function apiGet<T = any>(path: string): Promise<T> {
  // Website build only: many pages each ask the local desktop server for
  // /auth/session. The real backend has no such endpoint in the shape they
  // expect (roles[]), so answer it here from the stored login instead — one
  // choke point rather than editing every page. Electron never takes this
  // branch (isWebOnly is false there), so the desktop path is untouched.
  if (isWebOnly && path === '/auth/session') return sessionFromStoredCloud() as unknown as T;
  const adapted = await viaAdapter<T>('GET', path);
  if (adapted.hit) return adapted.value as T;
  return request<T>(path, { headers: authHeaders() });
}

export async function apiPost<T = any>(path: string, body?: any, options: RequestOptions = {}): Promise<T> {
  const adapted = await viaAdapter<T>('POST', path, body);
  if (adapted.hit) return adapted.value as T;
  const headers = authHeaders({ 'Idempotency-Key': options.idempotencyKey || idempotencyKey() });
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return request<T>(path, { method: 'POST', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

export async function apiPatch<T = any>(path: string, body?: any): Promise<T> {
  const adapted = await viaAdapter<T>('PATCH', path, body);
  if (adapted.hit) return adapted.value as T;
  const headers = authHeaders({ 'Content-Type': 'application/json' });
  return request<T>(path, { method: 'PATCH', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

export async function apiPut<T = any>(path: string, body?: any): Promise<T> {
  const adapted = await viaAdapter<T>('PUT', path, body);
  if (adapted.hit) return adapted.value as T;
  const headers = authHeaders({ 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() });
  return request<T>(path, { method: 'PUT', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const adapted = await viaAdapter<T>('DELETE', path);
  if (adapted.hit) return adapted.value as T;
  return request<T>(path, { method: 'DELETE', headers: authHeaders() });
}

// Convenience for entity CRUD — NOTE: this generic pattern assumed the local
// desktop server's own free-form entity store and has no equivalent on the
// real backend, which has one dedicated module per real entity. Kept only
// so any remaining caller doesn't hard-crash on import; nothing on the real
// backend answers `/${entity}` generically.
export const listEntity = <T = any>(entity: string) => apiGet<T[]>(`/${entity}`);
export const createEntity = <T = any>(entity: string, data: any) => apiPost<T>(`/${entity}`, { data });
