import assert from 'node:assert/strict'
import { matchAdapter } from '../src/lib/webAdapters/core'
import '../src/lib/webAdapters/settings'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
  removeItem(key: string) { this.values.delete(key) }
}

const localStorage = new MemoryStorage()
Object.defineProperty(globalThis, 'window', { value: { localStorage }, configurable: true })
let branchId = 'branch-a'
const profile = async () => ({ id: branchId, name: 'Demo Store' })

async function invoke(method: 'GET' | 'POST', path: string, body?: unknown) {
  const matched = matchAdapter(method, path)
  assert.ok(matched, `No ${method} adapter matched ${path}`)
  return matched.fn({
    get: async (url) => url === '/vendor/profile' ? profile() : Promise.reject(new Error(`Unexpected GET ${url}`)),
    post: async () => { throw new Error('Unexpected vendor POST') },
    put: async () => { throw new Error('Unexpected vendor PUT') },
    patch: async () => { throw new Error('Unexpected vendor PATCH') },
    del: async () => { throw new Error('Unexpected vendor DELETE') },
    params: matched.params,
    query: matched.query,
    body,
  })
}

localStorage.setItem('epic-web-print-settings-v1', JSON.stringify({ paperWidthMm: 80, upiId: 'legacy@upi', qrOnPrint: false }))
const migrated = await invoke('GET', '/settings/store') as any
assert.equal(migrated.upiId, 'legacy@upi', 'legacy UPI settings migrate into the currently active branch')
assert.equal(migrated.qrOnPrint, false)
assert.deepEqual(JSON.parse(localStorage.getItem('epic-web-print-settings-v1') || '{}'), { paperWidthMm: 80 }, 'the unscoped key no longer contains payment details')

const saved = await invoke('POST', '/settings/store', { upiId: 'branch-a@upi', qrOnPrint: true }) as any
assert.equal(saved.upiId, 'branch-a@upi')
assert.equal(saved.qrOnPrint, true)
assert.equal(saved.paperWidthMm, 80, 'a QR-only update preserves unrelated print settings')

branchId = 'branch-b'
const otherBranch = await invoke('GET', '/settings/store') as any
assert.equal(otherBranch.upiId, '', 'a different store cannot read the previous branch payment identifier')
assert.equal(otherBranch.qrOnPrint, true)
const otherPrintSettings = await invoke('GET', '/laundry/print-settings') as any
assert.equal(otherPrintSettings.upiId, '', 'invoice print settings use the same branch-scoped value')

branchId = 'branch-a'
const originalBranch = await invoke('GET', '/laundry/print-settings') as any
assert.equal(originalBranch.upiId, 'branch-a@upi')
assert.equal(originalBranch.qrOnPrint, true)
console.log('UPI QR adapter checks passed: branch scope, legacy migration, partial update, invoice print readback.')
