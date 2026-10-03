import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Eye, KeyRound, Loader2, Plus, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useDialogFocus } from '@/components/laundry/useDialogFocus'
import VisualLoadingState from '@/components/laundry/VisualLoadingState'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { isWebOnly } from '@/lib/cloudAuth'

type Role = 'owner' | 'counter_staff' | 'processing_staff' | 'rider'
type Staff = {
  id: string
  username: string
  roles: Role[]
  enabled: boolean
  firstName: string
  lastName: string
  email: string
  phone: string
  description: string
  riderId?: string
  createdAt: string
}
type Rider = { id: string; name: string; phone: string }
type StaffDraft = {
  username: string
  password: string
  roles: Role[]
  firstName: string
  lastName: string
  email: string
  phone: string
  description: string
  riderId: string
}

const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  counter_staff: 'Counter',
  processing_staff: 'Processing',
  rider: 'Captain',
}
const roleDescriptions: Record<Role, string> = {
  owner: 'Manage the branch, settings and staff access.',
  counter_staff: 'Handle customers, orders and counter payments.',
  processing_staff: 'Work on garments and the production queue.',
  rider: 'Handle assigned pickups and deliveries. Link an active Captain below.',
}
const blankDraft: StaffDraft = {
  username: '', password: '', roles: ['counter_staff'], firstName: '', lastName: '',
  email: '', phone: '', description: '', riderId: '',
}
const pageSizes = [10, 20, 50, 100, 500]

export default function LaundryStoreUsers() {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<'add' | 'view' | 'edit' | null>(null)
  const [selected, setSelected] = useState<Staff | null>(null)
  const [draft, setDraft] = useState<StaffDraft>(blankDraft)
  const [pendingAccess, setPendingAccess] = useState<{ user: Staff; enabled: boolean } | null>(null)
  const [notice, setNotice] = useState('')
  const staff = useQuery({ queryKey: ['store-staff'], queryFn: () => apiGet<Staff[]>('/settings/staff') })
  const riders = useQuery({ queryKey: ['laundry-riders'], queryFn: () => apiGet<Rider[]>('/laundry/riders') })
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['store-staff'] })
    void client.invalidateQueries({ queryKey: ['auth-session'] })
  }
  const create = useMutation({
    mutationFn: (input: StaffDraft) => apiPost<Staff>('/settings/staff', input),
    onSuccess: () => { invalidate(); setDialog(null); setDraft(blankDraft); setNotice('Store user added.') },
    onError: (error: Error) => setNotice(error.message || 'Could not add this store user.'),
  })
  const update = useMutation({
    mutationFn: async ({ user, input }: { user: Staff; input: StaffDraft }) => {
      const updated = await apiPatch<Staff>(`/settings/staff/${encodeURIComponent(user.id)}`, {
        firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone,
        description: input.description, roles: input.roles, riderId: input.riderId || undefined,
      })
      if (input.password) {
        try { await apiPost(`/settings/staff/${encodeURIComponent(user.id)}/reset-password`, { password: input.password }) }
        catch (error) { throw new Error(`Profile saved, but password reset failed: ${error instanceof Error ? error.message : 'Try again from this user’s profile.'}`) }
      }
      return updated
    },
    onSuccess: () => { invalidate(); setDialog(null); setSelected(null); setDraft(blankDraft); setNotice('Store user updated.') },
    onError: (error: Error) => { setDraft((value) => ({ ...value, password: '' })); invalidate(); setNotice(error.message || 'Could not update this store user.') },
  })
  const access = useMutation({
    mutationFn: ({ user, enabled }: { user: Staff; enabled: boolean }) => apiPost(`/settings/staff/${encodeURIComponent(user.id)}/enabled`, { enabled }),
    onSuccess: (_result, variables) => { invalidate(); setPendingAccess(null); setNotice(variables.enabled ? 'Sign-in access restored.' : 'Sign-in access switched off.') },
    onError: (error: Error) => setNotice(error.message || 'Could not change sign-in access.'),
  })

  const rows = staff.data || []
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return rows.filter((user) => !query || [user.firstName, user.lastName, user.username, user.phone, user.email, user.description, ...user.roles.map((role) => roleLabels[role])].some((value) => String(value || '').toLocaleLowerCase().includes(query)))
      .sort((a, b) => `${a.firstName} ${a.lastName} ${a.username}`.localeCompare(`${b.firstName} ${b.lastName} ${b.username}`))
  }, [rows, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = filtered.length ? (currentPage - 1) * pageSize + 1 : 0
  const end = Math.min(currentPage * pageSize, filtered.length)
  const visible = filtered.slice(start ? start - 1 : 0, end)

  function openAdd() { setNotice(''); create.reset(); setDraft(blankDraft); setSelected(null); setDialog('add') }
  function openView(user: Staff) { setNotice(''); setSelected(user); setDialog('view') }
  function openEdit(user: Staff) {
    setNotice(''); update.reset(); setSelected(user)
    setDraft({ username: user.username, password: '', roles: [...user.roles], firstName: user.firstName || '', lastName: user.lastName || '', email: user.email || '', phone: user.phone || '', description: user.description || '', riderId: user.riderId || '' })
    setDialog('edit')
  }
  function closeDialog() { setDialog(null); setSelected(null); setDraft(blankDraft); create.reset(); update.reset() }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = { ...draft, username: draft.username.trim(), firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim(), phone: draft.phone.trim(), description: draft.description.trim() }
    if (dialog === 'add') create.mutate(normalized)
    if (dialog === 'edit' && selected) update.mutate({ user: selected, input: normalized })
  }
  function setRole(role: Role) { setDraft((value) => ({ ...value, roles: [role], riderId: role === 'rider' ? value.riderId : '' })) }

  if (staff.isLoading) return <VisualLoadingState title="Loading store users" detail="Reading the accounts assigned to this branch." />
  if (staff.isError) return <div className="mx-auto max-w-5xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><p role="alert">The store user list could not be loaded.</p><button type="button" onClick={() => void staff.refetch()} className="mt-3 rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold">Try again</button></div>

  return <div className="mx-auto max-w-6xl animate-in fade-in slide-in-from-bottom-2 duration-300">
    <Link to="/laundry/settings" className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[#5740cb] hover:bg-[#f3f0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0]"><ArrowLeft className="h-4 w-4" />Back to Settings</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#664cf0]">Operations</p><h1 className="mt-1 font-serif text-3xl text-[#241a45]">Store Users</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6982]">View who can sign in to this branch, check their access role, and manage staff accounts.</p></div><button type="button" onClick={openAdd} disabled={isWebOnly} title={isWebOnly ? 'Team changes are managed in the LNDRY Partner app.' : undefined} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#5740cb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#664cf0] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Add User</button></div>
    {isWebOnly ? <p className="mt-4 rounded-xl border border-[#f0e1b4] bg-[#fffaf0] px-4 py-3 text-sm leading-5 text-[#74591d]">This connected staff list is read-only in Epic Laundry. Add users, edit profiles, or change access in the LNDRY Partner app under Team.</p> : null}
    {notice ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}
    <section aria-label="Store users" className="mt-6 overflow-hidden rounded-2xl border border-[#272043]/10 bg-white shadow-[0_8px_28px_rgba(32,23,60,.04)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#272043]/8 px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eeeaff] text-[#5740cb]"><ShieldCheck className="h-4 w-4" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-[#241a45]">Branch access</h2><p className="text-xs text-[#77718a]">{rows.length} user{rows.length === 1 ? '' : 's'} assigned to this branch</p></div><label className="relative min-w-[220px] flex-1 sm:max-w-sm"><span className="sr-only">Search users</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#77718a]" /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search name, phone or role..." className="h-10 w-full rounded-xl border border-[#342a63]/15 bg-white pl-9 pr-3 text-sm text-[#423b52] outline-none focus:border-[#664cf0]/45 focus:ring-2 focus:ring-[#664cf0]/20" /></label></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#272043]/8 px-5 py-3 text-xs text-[#6b667b]" aria-live="polite"><span>{filtered.length ? `Showing ${start}–${end} of ${filtered.length}` : search ? 'No users match this search' : 'No users yet'}</span><div className="flex items-center gap-2"><label htmlFor="users-page-size" className="font-semibold">Items per page</label><select id="users-page-size" aria-label="Items per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="rounded-lg border border-[#342a63]/15 bg-white px-2 py-1.5 font-semibold text-[#423b52]">{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-[#342a63]/15 px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="min-w-12 text-center">{currentPage} / {pageCount}</span><button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-[#342a63]/15 px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div>
      {visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#faf9fd] text-[10px] font-extrabold uppercase tracking-[.12em] text-[#77718a]"><tr><th className="px-5 py-3">Store user</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Sign-in access</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#272043]/8">{visible.map((user) => <UserRow key={user.id} user={user} isReadOnly={isWebOnly} busy={access.isPending} onView={() => openView(user)} onAccess={() => setPendingAccess({ user, enabled: !user.enabled })} />)}</tbody></table></div> : <div className="px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f2efff] text-[#664cf0]"><UserRound className="h-5 w-5" /></span><h2 className="mt-3 text-base font-extrabold text-[#332849]">{search ? 'No Data Found' : 'No store users yet'}</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-5 text-[#77718a]">{search ? 'Clear or change your search to see the full list.' : 'Add a team member when you are ready to give them branch access.'}</p>{search ? <button type="button" onClick={() => setSearch('')} className="mt-4 rounded-lg border border-[#664cf0]/20 bg-white px-3 py-2 text-xs font-bold text-[#5740cb]">Clear search</button> : <button type="button" onClick={openAdd} disabled={isWebOnly} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#664cf0]/20 bg-white px-3 py-2 text-xs font-bold text-[#5740cb] disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add User</button>}</div>}
    </section>
    {dialog === 'view' && selected ? <UserDetails user={selected} isReadOnly={isWebOnly} onClose={closeDialog} onEdit={() => openEdit(selected)} /> : null}
    {(dialog === 'add' || dialog === 'edit') ? <UserForm mode={dialog} draft={draft} setDraft={setDraft} user={selected || undefined} riders={riders.data || []} saving={create.isPending || update.isPending} error={dialog === 'add' ? create.error : update.error} readOnly={isWebOnly} duplicate={rows.some((user) => user.username.trim().toLocaleLowerCase() === draft.username.trim().toLocaleLowerCase() && user.id !== selected?.id)} onClose={closeDialog} onSubmit={submit} onRole={setRole} /> : null}
    {pendingAccess ? <AccessDialog user={pendingAccess.user} enabled={pendingAccess.enabled} saving={access.isPending} onClose={() => setPendingAccess(null)} onConfirm={() => access.mutate(pendingAccess)} /> : null}
  </div>
}

function displayName(user: Staff) { return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username }
function roleText(user: Staff) { return user.roles.map((role) => roleLabels[role] || role).join(' · ') || 'No role assigned' }

function UserRow({ user, isReadOnly, busy, onView, onAccess }: { user: Staff; isReadOnly: boolean; busy: boolean; onView: () => void; onAccess: () => void }) {
  return <tr className="align-middle"><td className="px-5 py-4"><p className="text-sm font-bold text-[#332849]">{displayName(user)}</p><p className="mt-1 text-xs text-[#77718a]">@{user.username}{user.description ? ` · ${user.description}` : ''}</p></td><td className="px-4 py-4 text-sm text-[#514b67]">{user.phone || '—'}</td><td className="px-4 py-4"><span className="rounded-full bg-[#eeeaff] px-2.5 py-1 text-xs font-bold text-[#5740cb]">{roleText(user)}</span></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-[#f1eff5] text-[#686479]'}`}>{user.enabled ? 'Enabled' : 'Disabled'}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button type="button" aria-label={`View ${displayName(user)}`} onClick={onView} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#ded9f7] px-3 py-1.5 text-xs font-bold text-[#5740cb] hover:bg-[#f8f7ff]"><Eye className="h-3.5 w-3.5" />View</button>{!isReadOnly ? <button type="button" disabled={busy} aria-label={`${user.enabled ? 'Disable' : 'Enable'} access for ${displayName(user)}`} onClick={onAccess} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#ded9f7] px-3 py-1.5 text-xs font-bold text-[#514b67] hover:bg-[#f8f7ff] disabled:opacity-50">{user.enabled ? 'Disable access' : 'Enable access'}</button> : null}</div></td></tr>
}

function UserDetails({ user, isReadOnly, onEdit, onClose }: { user: Staff; isReadOnly: boolean; onEdit: () => void; onClose: () => void }) {
  const focus = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  const fields: Array<[string, string]> = [['First Name', user.firstName || '—'], ['Last Name', user.lastName || '—'], ['User Name', user.username], ['Email', user.email || '—'], ['Phone', user.phone || '—'], ['Role', roleText(user)], ['Description', user.description || '—'], ['Sign-in access', user.enabled ? 'Enabled' : 'Disabled']]
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={focus.dialogRef} role="dialog" aria-modal="true" aria-labelledby="user-view-title" tabIndex={-1} onKeyDown={focus.onKeyDown} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Store Users</p><h2 id="user-view-title" className="mt-1 font-serif text-2xl text-[#241a45]">View User</h2></div><button ref={focus.initialFocusRef} type="button" aria-label="Close user details" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#686479] hover:bg-[#f5f2ff]"><X className="h-4 w-4" /></button></div><dl className="mt-5 grid gap-2 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-xl bg-[#faf9fd] p-3"><dt className="text-xs font-bold text-[#77718a]">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-[#332849]">{value}</dd></div>)}</dl><p className="mt-3 flex items-center gap-2 text-xs leading-5 text-[#77718a]"><KeyRound className="h-3.5 w-3.5 shrink-0" />Passwords are never shown here. To replace one, edit the profile and enter a new password.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67]">Close</button><button type="button" disabled={isReadOnly} onClick={onEdit} title={isReadOnly ? 'Team changes are managed in the LNDRY Partner app.' : undefined} className="min-h-10 rounded-xl bg-[#664cf0] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Edit User</button></div>{isReadOnly ? <p className="mt-3 text-right text-xs text-[#74591d]">Profile changes are managed in the LNDRY Partner app.</p> : null}</div></div>
}

function UserForm({ mode, draft, setDraft, user, riders, saving, error, readOnly, duplicate, onClose, onSubmit, onRole }: { mode: 'add' | 'edit'; draft: StaffDraft; setDraft: (value: StaffDraft | ((current: StaffDraft) => StaffDraft)) => void; user?: Staff; riders: Rider[]; saving: boolean; error: unknown; readOnly: boolean; duplicate: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onRole: (role: Role) => void }) {
  const title = mode === 'add' ? 'Add Store User' : 'Edit Store User'
  const focus = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  const selectedRole = draft.roles[0] || 'counter_staff'
  const passwordInvalid = mode === 'add' ? draft.password.length < 12 : Boolean(draft.password && draft.password.length < 12)
  const needsOwnerConfirmation = draft.roles.includes('owner') && !user?.roles.includes('owner')
  const [ownerAcknowledged, setOwnerAcknowledged] = useState(false)
  const captainLinkMissing = draft.roles.includes('rider') && !draft.riderId
  const valid = Boolean(draft.firstName.trim() && draft.username.trim() && draft.phone.trim() && draft.roles.length && !duplicate && !passwordInvalid && !captainLinkMissing && (!needsOwnerConfirmation || ownerAcknowledged))
  const handleRole = (role: Role) => { setOwnerAcknowledged(false); onRole(role) }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div ref={focus.dialogRef} role="dialog" aria-modal="true" aria-labelledby="user-form-title" tabIndex={-1} onKeyDown={focus.onKeyDown} className="max-h-[min(90vh,850px)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Store Users</p><h2 id="user-form-title" className="mt-1 font-serif text-2xl text-[#241a45]">{title}</h2></div><button ref={focus.initialFocusRef} type="button" aria-label="Close user form" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-[#686479] hover:bg-[#f5f2ff]"><X className="h-4 w-4" /></button></div>{readOnly ? <p className="mt-4 rounded-xl bg-[#fffaf0] px-3 py-2 text-xs leading-5 text-[#74591d]">Team changes are managed in the LNDRY Partner app. No information entered here can be saved from this connected workspace.</p> : null}<form className="mt-5 space-y-4" onSubmit={onSubmit}><div className="grid gap-4 sm:grid-cols-2"><CounterInput label="First Name *" value={draft.firstName} maxLength={50} required onChange={(firstName) => setDraft((value) => ({ ...value, firstName }))} /><CounterInput label="Last Name" value={draft.lastName} maxLength={50} onChange={(lastName) => setDraft((value) => ({ ...value, lastName }))} /><CounterInput label="User Name *" value={draft.username} maxLength={250} required disabled={mode === 'edit'} autoComplete="username" onChange={(username) => setDraft((value) => ({ ...value, username }))} /><CounterInput label={mode === 'add' ? 'Password *' : 'New Password (optional)'} value={draft.password} maxLength={128} required={mode === 'add'} minLength={12} type="password" autoComplete="new-password" onChange={(password) => setDraft((value) => ({ ...value, password }))} hint={mode === 'add' ? 'Use at least 12 characters.' : 'Leave blank to keep the current password.'} /><CounterInput label="Email" value={draft.email} maxLength={100} type="email" autoComplete="email" onChange={(email) => setDraft((value) => ({ ...value, email }))} /><CounterInput label="Phone *" value={draft.phone} maxLength={15} required type="tel" autoComplete="tel" onChange={(phone) => setDraft((value) => ({ ...value, phone }))} /><label className="block text-sm font-semibold text-[#423b52]">Role *<select aria-label="Role" required value={selectedRole} onChange={(event) => handleRole(event.target.value as Role)} className="mt-1.5 h-11 w-full rounded-xl border border-[#342a63]/15 bg-white px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[#664cf0]/30"><option value="">Choose a role</option>{Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select><span className="mt-1 block text-xs font-normal leading-5 text-[#77718a]">{roleDescriptions[selectedRole]} Choose only the access needed for this person.</span></label><label className="block text-sm font-semibold text-[#423b52] sm:col-span-2">Description / designation<textarea maxLength={500} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} className="mt-1.5 min-h-20 w-full rounded-xl border border-[#342a63]/15 px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-[#664cf0]/30" /><span className="mt-1 block text-right text-[11px] font-normal text-[#77718a]">{draft.description.length}/500</span></label></div>{selectedRole === "rider" ? <label className="block text-sm font-semibold text-[#423b52]">Link active Captain *<select aria-label="Link active Captain" required value={draft.riderId} onChange={(event) => setDraft((value) => ({ ...value, riderId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-[#342a63]/15 bg-white px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[#664cf0]/30"><option value="">Choose Captain</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#77718a]">Link this account to a Captain pickup and delivery record.</span>{riders.length === 0 ? <span className="mt-1 block text-xs font-semibold text-amber-800">No active Captains are available. Add a Captain record first.</span> : null}</label> : null}{needsOwnerConfirmation ? <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><input type="checkbox" checked={ownerAcknowledged} onChange={(event) => setOwnerAcknowledged(event.target.checked)} className="mt-1 accent-[#664cf0]" /><span><strong>Owner access is broad.</strong> This account can manage branch settings and other staff access. Confirm this person needs those permissions.</span></label> : null}{duplicate ? <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">A user with this username already exists in this branch.</p> : null}{passwordInvalid ? <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">The password must be at least 12 characters long.</p> : null}{error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error instanceof Error ? error.message : 'Could not save this store user.'}</p> : null}<div className="flex justify-end gap-2 border-t border-[#272043]/8 pt-4"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67]">Cancel</button><button type="submit" disabled={saving || readOnly || !valid} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#664cf0] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{saving ? 'Saving…' : 'Save'}</button></div></form></div></div>
}

function CounterInput({ label, value, onChange, maxLength, type = 'text', required, disabled, autoComplete, minLength, hint }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; type?: string; required?: boolean; disabled?: boolean; autoComplete?: string; minLength?: number; hint?: string }) {
  const inputId = `store-user-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return <label htmlFor={inputId} className="block text-sm font-semibold text-[#423b52]">{label}<input id={inputId} aria-label={label.replace(' *', '')} type={type} required={required} disabled={disabled} minLength={minLength} maxLength={maxLength} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#342a63]/15 px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-[#664cf0]/30 disabled:bg-[#f5f3f8]" /><span className="mt-1 flex justify-between gap-2 text-[11px] font-normal text-[#77718a]"><span>{hint || (required ? 'Required' : 'Optional')}</span><span>{value.length}/{maxLength}</span></span></label>
}

function AccessDialog({ user, enabled, saving, onClose, onConfirm }: { user: Staff; enabled: boolean; saving: boolean; onClose: () => void; onConfirm: () => void }) {
  const focus = useDialogFocus<HTMLDivElement, HTMLButtonElement>(onClose)
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17122b]/55 p-4 backdrop-blur-sm"><div ref={focus.dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="access-dialog-title" tabIndex={-1} onKeyDown={focus.onKeyDown} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#664cf0]">Store Users</p><h2 id="access-dialog-title" className="mt-1 font-serif text-xl text-[#241a45]">{enabled ? 'Enable' : 'Disable'} access for {displayName(user)}?</h2><p className="mt-2 text-sm leading-5 text-[#6f6982]">{enabled ? 'This person will be able to sign in to the branch again.' : 'This person will be signed out and cannot sign in until access is enabled again.'}</p><div className="mt-5 flex justify-end gap-2"><button ref={focus.initialFocusRef} type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d8d2ee] px-4 py-2 text-sm font-bold text-[#514b67]">Cancel</button><button type="button" disabled={saving} onClick={onConfirm} className="min-h-10 rounded-xl bg-[#664cf0] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? <><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Updating…</> : `Confirm ${enabled ? 'enable' : 'disable'}`}</button></div></div></div>
}
