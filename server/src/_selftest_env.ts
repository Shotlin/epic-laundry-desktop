// Shared harness for HTTP-based self-tests. MUST be imported before any kernel module so the
// isolated EPIC_DATA_FILE is set before store.ts reads it at module-eval time.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PORT = 3101;
export const BASE = `http://127.0.0.1:${PORT}`;

process.env.EPIC_DATA_FILE = process.env.EPIC_DATA_FILE || path.join(os.tmpdir(), `epic-st-${randomUUID()}.json`);
process.env.PORT = String(PORT);
process.env.HOST = '127.0.0.1';
process.env.GSP_PROVIDER = 'sandbox';
process.env.EPIC_API_KEY = process.env.EPIC_API_KEY || 'dev-key-change-me';

export const authH = () => ({ headers: { 'x-api-key': process.env.EPIC_API_KEY as string } });
export const j = (o: any) => o;

// Build an in-process Fastify app (api + static) on an isolated store. We use app.inject() for
// requests (no real listening socket) which avoids the libuv "handle closing" abort on teardown.
export async function buildTest() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  const dir = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, { root: path.join(dir, '..', 'public'), prefix: '/ui/' });
  const { registerApi } = await import('./api.js');
  registerApi(app);
  await app.ready();
  return app;
}

export async function closeTest(app: any) {
  await app.close().catch(() => {});
}

export async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server not healthy');
}
