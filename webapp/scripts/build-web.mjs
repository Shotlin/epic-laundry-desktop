// Builds the website (Vercel) variant: served from the site root, output in ./dist.
// Cross-platform stand-in for `EPIC_WEB_TARGET=vercel vite build`.
import { spawnSync } from 'node:child_process'
// The Windows print-agent installer served at /print-agent/ is generated from print-agent/lndry-print-agent.ps1.
const agent = spawnSync(process.execPath, ['scripts/build-print-agent.mjs'], { stdio: 'inherit' })
if (agent.status !== 0) process.exit(agent.status ?? 1)
const result = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', shell: true, env: { ...process.env, EPIC_WEB_TARGET: 'vercel' } })
process.exit(result.status ?? 1)
