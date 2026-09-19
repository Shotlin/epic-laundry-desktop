// Direct browser -> real LNDRY backend auth, for the web-only deployment of
// this app (no local Node server in front of it — see api.ts's header for
// why). Mirrors the proven, already-battle-tested flow in
// epic-laundry-desktop/server/src/modules/marketplace/cloud-client.ts and
// auth/cloud-auth.ts as closely as possible, since those already worked out
// several real, non-obvious gotchas against the live backend:
//   - verify-otp's own access token carries no shopRole/vendor_id claim —
//     every shopRole-gated /api/v1/vendor/* route reads shopRole directly
//     off the JWT with no DB fallback, so the token MUST be refreshed once
//     immediately after verify, before it's ever used, or every vendor
//     route 403s until some unrelated future request happens to refresh it.
//   - /auth/refresh-token is the one endpoint that wants a camelCase
//     `refreshToken` body key — everything else here is snake_case.
//   - a second verify-otp call with the same code reliably fails; never
//     re-verify, only ever refresh.
//   - the real login gate is GET /auth/my-roles, not verify-otp's own
//     embedded role claim.

const CLOUD_API_BASE = import.meta.env.VITE_LNDRY_API_BASE?.replace(/\/$/, '') || 'https://api.lndry.in/api/v1'
const TOKENS_KEY = 'epic-web-cloud-tokens-v1'

export type CloudTokens = { accessToken: string; refreshToken: string; accessTokenExpiresAt: string }
export type StoredSession = CloudTokens & { phone: string; name: string; shopRole: 'VENDOR_OWNER' | 'VENDOR_STAFF'; vendorId?: string }

export class CloudAuthError extends Error {
  constructor(readonly code: 'RIDER_ONLY_ACCOUNT' | 'AMBIGUOUS_VENDOR_ACCOUNT' | 'CLOUD_LOGIN_INPUT_REQUIRED' | 'CLOUD_LOGIN_FAILED', message: string) {
    super(message)
    this.name = 'CloudAuthError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function callCloud(path: string, opts: { method?: string; body?: unknown; accessToken?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`
  const res = await fetch(CLOUD_API_BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.success === false) {
    const message = body?.message || body?.error?.message || `${path} -> ${res.status}`
    const err = new Error(message) as Error & { code?: string; status?: number }
    err.code = body?.code || body?.error?.code
    err.status = res.status
    throw err
  }
  return body
}

export async function sendOtp(phone: string): Promise<{ sent: true; otp?: string }> {
  const body = await callCloud('/auth/send-otp', { method: 'POST', body: { phone } })
  const data = isRecord(body.data) ? body.data : body
  return { sent: true, otp: typeof data.otp === 'string' && data.otp ? data.otp : undefined }
}

async function verifyOtp(phone: string, otp: string): Promise<CloudTokens> {
  const body = await callCloud('/auth/verify-otp', { method: 'POST', body: { phone, otp } })
  const data = isRecord(body.data) ? body.data : body
  return {
    accessToken: String(data.access_token ?? data.accessToken ?? ''),
    refreshToken: String(data.refresh_token ?? data.refreshToken ?? ''),
    accessTokenExpiresAt: typeof data.expires_at === 'string' ? data.expires_at : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<CloudTokens> {
  const body = await callCloud('/auth/refresh-token', { method: 'POST', body: { refreshToken } })
  const data = isRecord(body.data) ? body.data : body
  return {
    accessToken: String(data.access_token ?? data.accessToken ?? ''),
    refreshToken: String(data.refresh_token ?? data.refreshToken ?? refreshToken),
    accessTokenExpiresAt: typeof data.expires_at === 'string' ? data.expires_at : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }
}

async function getMyRoles(accessToken: string): Promise<string[]> {
  const body = await callCloud('/auth/my-roles', { accessToken })
  const data = isRecord(body.data) ? body.data : body
  return Array.isArray(data.roles) ? data.roles.filter((role: unknown): role is string => typeof role === 'string') : []
}

async function getVendorProfile(accessToken: string): Promise<{ vendorId?: string; name?: string }> {
  try {
    const body = await callCloud('/vendor/profile', { accessToken })
    const data = isRecord(body.data) ? body.data : body
    return { vendorId: typeof data.id === 'string' ? data.id : undefined, name: typeof data.name === 'string' ? data.name : undefined }
  } catch { return {} }
}

/** Verify once, refresh once (never re-verify), check the real role gate, persist. */
export async function loginWithOtp(phone: string, otp: string): Promise<StoredSession> {
  const cleanPhone = phone.trim()
  const cleanOtp = otp.trim()
  if (!cleanPhone || !cleanOtp) throw new CloudAuthError('CLOUD_LOGIN_INPUT_REQUIRED', 'A phone number and one-time code are required.')

  const initial = await verifyOtp(cleanPhone, cleanOtp)
  const refreshed = await refreshAccessToken(initial.refreshToken)
  const roles = await getMyRoles(refreshed.accessToken)

  const isOwner = roles.includes('VENDOR_OWNER')
  const isStaff = roles.includes('VENDOR_STAFF')
  if (!isOwner && !isStaff) {
    if (roles.includes('RIDER') || roles.includes('VENDOR_RIDER')) {
      throw new CloudAuthError('RIDER_ONLY_ACCOUNT', 'This phone is registered as a Captain (delivery) account. Captains cannot access this store workspace.')
    }
    throw new CloudAuthError('AMBIGUOUS_VENDOR_ACCOUNT', 'This phone is not recognized as a vendor account for any shop. Contact support if you believe this is wrong.')
  }
  const profile = await getVendorProfile(refreshed.accessToken)
  const session: StoredSession = {
    ...refreshed, phone: cleanPhone, name: profile.name || '', shopRole: isOwner ? 'VENDOR_OWNER' : 'VENDOR_STAFF', vendorId: profile.vendorId,
  }
  storeSession(session)
  return session
}

export function storeSession(session: StoredSession) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKENS_KEY, JSON.stringify(session))
}

export function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TOKENS_KEY) || 'null')
    return parsed && typeof parsed.accessToken === 'string' ? parsed as StoredSession : null
  } catch { return null }
}

export function clearStoredSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKENS_KEY)
}

/** Called by api.ts on a 401 — refreshes and re-persists, or clears the session if the refresh itself fails. */
export async function refreshStoredSession(): Promise<StoredSession | null> {
  const current = readStoredSession()
  if (!current?.refreshToken) return null
  try {
    const refreshed = await refreshAccessToken(current.refreshToken)
    const next: StoredSession = { ...current, ...refreshed }
    storeSession(next)
    return next
  } catch {
    clearStoredSession()
    return null
  }
}

/** True when running as a plain website (no Electron `window.epic` bridge) — the single source of truth every component branches on, so the Electron build's own code paths are never touched. */
export const isWebOnly = typeof window !== 'undefined' && !window.epic

/**
 * Builds the shell's expected `{user:{username,roles,storeId}}` session
 * shape straight from the already-stored login (see loginWithOtp) — no
 * network call, since the real backend has no equivalent of the local
 * desktop server's own multi-role /auth/session. LNDRY only has two shop
 * roles, mapped onto the closest existing UI permission tier: VENDOR_OWNER
 * gets full access (epic's own 'owner' role), VENDOR_STAFF gets the
 * counter-staff tier — LNDRY has no finer-grained processing/rider split
 * for its own vendor staff today.
 */
export function sessionFromStoredCloud(): { user: { username: string; roles: string[]; storeId: string } | null } {
  const stored = readStoredSession()
  if (!stored) return { user: null }
  return { user: { username: stored.phone, roles: stored.shopRole === 'VENDOR_OWNER' ? ['owner'] : ['counter_staff'], storeId: stored.vendorId || '' } }
}

export { CLOUD_API_BASE }
