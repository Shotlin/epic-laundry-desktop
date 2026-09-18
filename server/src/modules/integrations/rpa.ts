// RPA / automation hook: emit an outbox event so an external worker (or the event bus)
// can run a bot/automation. Keeps the kernel framework-free; real bots subscribe to `rpa.*`.
import { publish } from '../../kernel/event-bus.js';

export function runBot(tenant: string, actor: string, bot: string, input: Record<string, any> = {}): { ok: boolean; event: string } {
  const evt = publish(tenant, `rpa.${bot}`, { bot, actor, input });
  return { ok: true, event: evt.id };
}

// Bank statement fetch adapter (integration seam). With BANK_API_KEY set this is where a real
// provider (e.g. setu/pennant) call would go; otherwise returns an empty normalized structure.
export async function fetchBankStatement(opts: { provider?: string; account?: string }): Promise<{ provider: string; lines: any[] }> {
  const provider = opts.provider || process.env.BANK_PROVIDER || 'none';
  if (process.env.BANK_API_KEY) {
    // real fetch would happen here; placeholder keeps the seam explicit and testable
  }
  return { provider, lines: [] };
}
