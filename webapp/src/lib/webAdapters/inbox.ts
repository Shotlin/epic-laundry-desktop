// The notification bell: the signed-in user's own LNDRY inbox (new app orders, customer approvals, ...).
import { route } from './core'

type RealNotification = { id: string; title: string; body?: string | null; type?: string | null; is_read?: boolean; created_at: string }

route('GET', '/notifications', async ({ get }) => {
  const data = await get('/notifications?page=1&limit=30')
  return ((data?.notifications || []) as RealNotification[]).map((row) => ({
    id: row.id, title: row.title, body: row.body || undefined, kind: row.type || undefined, read: row.is_read === true, created_at: row.created_at,
  }))
})
route('POST', '/notifications/:id/read', async ({ patch, params }) => patch(`/notifications/${params.id}/read`, {}))
