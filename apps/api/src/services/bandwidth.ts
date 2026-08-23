import type { FastifyInstance } from 'fastify';
import { parseBandwidth } from '../rclone/options.js';

/**
 * rclone limits bandwidth with a single token bucket for the whole process, so
 * a per-call `_config.BwLimit` is silently ignored. CloudBridge therefore keeps
 * track of the limits requested by the runs that are currently active and
 * drives `core/bwlimit` itself.
 *
 * While several limited runs overlap the most restrictive one wins; when none
 * is left the global default from Settings is restored.
 */
export class BandwidthManager {
  private readonly holders = new Map<string, string>();
  private applied: string | null = null;

  constructor(private readonly app: FastifyInstance) {}

  async acquire(runId: string, limit: string | null): Promise<void> {
    if (!limit) return;
    this.holders.set(runId, limit);
    await this.apply();
  }

  async release(runId: string): Promise<void> {
    if (!this.holders.delete(runId)) return;
    await this.apply();
  }

  /** The limit currently in force, for display. */
  get current(): string | null {
    return this.applied;
  }

  /** Re-assert the global default; called on boot and when Settings change. */
  async applyDefault(): Promise<void> {
    await this.apply();
  }

  private async apply(): Promise<void> {
    const fallback = this.app.settings.transferDefaults().bwlimit;
    const candidates = [...this.holders.values(), ...(fallback ? [fallback] : [])];

    let winner: string | null = null;
    let winnerBytes = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const bytes = parseBandwidth(candidate);
      if (bytes !== null && bytes < winnerBytes) {
        winnerBytes = bytes;
        winner = candidate;
      }
    }

    const target = winner ?? 'off';
    if (target === (this.applied ?? 'off')) return;

    try {
      await this.app.rclone.bwlimit(target);
      this.applied = winner;
      this.app.log.info({ bwlimit: target }, 'Límite de ancho de banda global aplicado');
    } catch (error) {
      this.app.log.warn({ err: error, bwlimit: target }, 'No se pudo aplicar el límite de ancho de banda');
    }
  }
}
