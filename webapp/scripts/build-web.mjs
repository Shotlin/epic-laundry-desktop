// Builds the website (Vercel) variant: served from the site root, output in ./dist.
// Cross-platform stand-in for `EPIC_WEB_TARGET=vercel vite build`.
import { spawnSync } from 'node:child_process'
const result = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', shell: true, env: { ...process.env, EPIC_WEB_TARGET: 'vercel' } })
process.exit(result.status ?? 1)
