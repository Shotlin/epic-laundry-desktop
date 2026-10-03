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
const services = [{ id: 'wash-id', name: 'Wash', active: true }, { id: 'inactive-id', name: 'Old Service', active: false }]

async function invoke(method: 'GET' | 'POST', path: string, body?: unknown) {
  const matched = matchAdapter(method, path)
  assert.ok(matched, `No ${method} adapter matched ${path}`)
  return matched.fn({
    get: async (url) => {
      if (url === '/vendor/profile') return { id: branchId, name: 'Demo Store' }
      if (url === '/vendor/pos-catalogue') return { services }
      throw new Error(`Unexpected GET ${url}`)
    },
    post: async () => { throw new Error('Unexpected vendor POST') },
    put: async () => { throw new Error('Unexpected vendor PUT') },
    patch: async () => { throw new Error('Unexpected vendor PATCH') },
    del: async () => { throw new Error('Unexpected vendor DELETE') },
    params: matched.params, query: matched.query, body,
  })
}

assert.deepEqual(await invoke('GET', '/settings/store-packages'), [], 'new branch starts with no Store Packages')
await assert.rejects(() => invoke('POST', '/settings/store-packages', {
  name: 'Invalid', amount: 100, serviceIds: ['inactive-id'], limitsEnabled: false, serviceLimits: [],
}), /no longer available/, 'inactive services cannot be attached to a new package')
await assert.rejects(() => invoke('POST', '/settings/store-packages', {
  name: 'Invalid precision', amount: 100, serviceIds: ['wash-id'], limitsEnabled: true,
  serviceLimits: [{ serviceId: 'wash-id', quantityLimit: 1.2345, amountLimit: 100 }],
}), /at most three decimal places/, 'unsupported quantity precision is rejected')
const created = await invoke('POST', '/settings/store-packages', {
  name: 'Wash Plan', amount: 1000.5, serviceIds: ['wash-id'], limitsEnabled: true,
  serviceLimits: [{ serviceId: 'wash-id', quantityLimit: 2.5, amountLimit: 1200 }],
}) as any
assert.equal(created.services[0].name, 'Wash')
assert.equal(created.serviceLimits[0].quantityLimit, 2.5)
assert.equal(created.serviceLimits[0].amountLimit, 1200)
assert.equal((await invoke('GET', '/settings/store-packages') as any[]).length, 1, 'package persists through the settings adapter')
assert.equal(((await invoke('GET', '/settings/store') as any).storePackages as any[]).length, 1, 'the combined settings read returns the same package list')

branchId = 'branch-b'
assert.deepEqual(await invoke('GET', '/settings/store-packages'), [], 'package configuration is scoped to the active branch')
branchId = 'branch-a'
assert.equal((await invoke('GET', '/settings/store-packages') as any[])[0].name, 'Wash Plan', 'switching back reads the original branch package')
console.log('Store Package adapter checks passed: active service validation, persistence and branch isolation.')
