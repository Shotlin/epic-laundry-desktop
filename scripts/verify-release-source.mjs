import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scope = process.argv[2] || 'server'
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
const regressionBlock = workflow.split('Run full server regression and V3 tagging gates')[1].split('working-directory: server')[0]
const serverTests = [...regressionBlock.matchAll(/npm run (test:[a-z0-9-]+)/g)].map((match) => match[1])
const commands = scope === 'server'
  ? ['typecheck', 'build', ...serverTests].map((script) => ({ cwd: 'server', args: ['run', script], label: script }))
  : scope === 'webapp'
    ? [{ cwd: 'webapp', args: ['run', 'build'], label: 'build' }, { cwd: 'webapp', args: ['run', 'audit:a11y'], label: 'audit:a11y' }, ...['report', 'statistics', 'store-packages', 'upi-qr'].map((name) => ({ cwd: 'webapp', node: true, args: ['../server/node_modules/tsx/dist/cli.mjs', '--tsconfig', 'tsconfig.json', `scripts/test-${name}-adapter.ts`], label: `${name} adapter` }))]
    : scope === 'desktop'
      ? ['test:workspace', 'test:cloud-config', 'test:menu-routing', 'test:recovery-policy', 'test:release-signature', 'test:production-release-guard'].map((script) => ({ cwd: 'desktop', args: ['run', script], label: script }))
      : []
if (!commands.length) throw new Error('Choose server, webapp or desktop')
const results = []
for (const command of commands) {
  console.log(`VERIFY ${scope}: ${command.label}`)
  const result = spawnSync(command.node ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm', command.args, { cwd: resolve(root, command.cwd), encoding: 'utf8', shell: !command.node && process.platform === 'win32', timeout: 180000, maxBuffer: 8 * 1024 * 1024 })
  console.log(result.stdout || '')
  if (result.status !== 0) console.error(result.stderr || result.error?.message || 'Command failed')
  results.push({ label: command.label, passed: result.status === 0, status: result.status, error: result.error?.message })
  if (result.status !== 0) break
}
mkdirSync(resolve(root, 'artifacts/release-verification'), { recursive: true })
writeFileSync(resolve(root, `artifacts/release-verification/${scope}.json`), JSON.stringify({ verifiedAt: new Date().toISOString(), scope, expected: commands.length, results }, null, 2))
console.log(`${scope}: ${results.filter((result) => result.passed).length}/${commands.length} checks passed`)
process.exit(results.length === commands.length && results.every((result) => result.passed) ? 0 : 1)
