import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type {
  RcloneHealth,
  Run,
  RunWithStats,
  StatsSnapshot,
  WsServerMessage,
} from '@cloudbridge/shared';
import { EMPTY_STATS } from '@cloudbridge/shared';
import type { RcCoreStats } from '../rclone/types.js';
import { RcloneError, RcloneUnavailableError } from '../rclone/client.js';

/**
 * Single ticker that polls rclone, finalises finished runs and pushes a
 * snapshot to every connected websocket.
 *
 * Progress is read per run with `core/stats?group=run:<id>`, which is why every
 * operation is issued with its own `_group`: without it all runs would share
 * one set of counters.
 */
export class StatsBroadcaster {
  private readonly clients = new Set<WebSocket>();
  private timer: NodeJS.Timeout | null = null;
  private health: RcloneHealth = {
    online: false,
    version: null,
    error: null,
    checkedAt: new Date(0).toISOString(),
  };
  private lastHealthCheck = 0;

  constructor(
    private readonly app: FastifyInstance,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const client of this.clients) client.close();
    this.clients.clear();
  }

  add(socket: WebSocket): void {
    this.clients.add(socket);
    this.send(socket, { type: 'hello', ts: new Date().toISOString(), interval: this.intervalMs });
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));
  }

  get clientCount(): number {
    return this.clients.size;
  }

  emitRunFinished(run: Run): void {
    this.broadcast({ type: 'run:finished', ts: new Date().toISOString(), run });
  }

  private send(socket: WebSocket, message: WsServerMessage): void {
    if (socket.readyState !== socket.OPEN) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.clients.delete(socket);
    }
  }

  private broadcast(message: WsServerMessage): void {
    for (const client of this.clients) this.send(client, message);
  }

  private toSnapshot(stats: RcCoreStats | null): StatsSnapshot {
    if (!stats) return EMPTY_STATS;
    return {
      bytes: stats.bytes ?? 0,
      totalBytes: stats.totalBytes ?? 0,
      speed: stats.speed ?? 0,
      transfers: stats.transfers ?? 0,
      totalTransfers: stats.totalTransfers ?? 0,
      checks: stats.checks ?? 0,
      totalChecks: stats.totalChecks ?? 0,
      errors: stats.errors ?? 0,
      fatalError: Boolean(stats.fatalError),
      retryError: Boolean(stats.retryError),
      elapsedTime: stats.elapsedTime ?? 0,
      eta: stats.eta ?? null,
      transferring: (stats.transferring ?? []).map((item) => ({
        name: item.name,
        size: item.size ?? 0,
        bytes: item.bytes ?? 0,
        percentage: item.percentage ?? 0,
        speed: item.speed ?? 0,
        speedAvg: item.speedAvg ?? 0,
        eta: item.eta ?? null,
        ...(item.group ? { group: item.group } : {}),
        ...(item.srcFs ? { srcFs: item.srcFs } : {}),
        ...(item.dstFs ? { dstFs: item.dstFs } : {}),
      })),
    };
  }

  /** Cached rclone reachability, refreshed every few seconds at most. */
  private async probeHealth(): Promise<RcloneHealth> {
    if (Date.now() - this.lastHealthCheck < 5000) return this.health;
    this.lastHealthCheck = Date.now();
    try {
      const version = await this.app.rclone.version();
      this.health = {
        online: true,
        version: version.version,
        error: null,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.health = {
        online: false,
        version: null,
        error:
          error instanceof RcloneError || error instanceof RcloneUnavailableError
            ? error.message
            : 'El daemon rclone no responde',
        checkedAt: new Date().toISOString(),
      };
    }
    return this.health;
  }

  private async tick(): Promise<void> {
    const active = this.app.runs.active().filter((run) => run.status === 'running');

    // Nothing running and nobody watching: skip the round trip entirely.
    if (active.length === 0 && this.clients.size === 0) return;

    try {
      await this.app.transfers.reconcile();
    } catch (error) {
      this.app.log.warn({ err: error }, 'Fallo reconciliando ejecuciones');
    }

    if (this.clients.size === 0) return;

    const health = await this.probeHealth();
    if (!health.online) {
      this.broadcast({
        type: 'stats',
        ts: new Date().toISOString(),
        health,
        global: EMPTY_STATS,
        runs: [],
      });
      return;
    }

    const running = this.app.runs.active();
    const [globalStats, ...perRun] = await Promise.all([
      this.app.rclone.stats().catch(() => null),
      ...running.map((run) => this.app.rclone.stats(run.group).catch(() => null)),
    ]);

    const runs: RunWithStats[] = running.map((run, index) => ({
      ...run,
      stats: this.toSnapshot(perRun[index] ?? null),
    }));

    this.broadcast({
      type: 'stats',
      ts: new Date().toISOString(),
      health,
      global: this.toSnapshot(globalStats),
      runs,
    });
  }
}
