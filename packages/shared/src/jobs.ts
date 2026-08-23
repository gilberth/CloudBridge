import type { JobMode } from './common.js';
import type { RemotePath } from './fs.js';
import type { Run } from './transfers.js';

export interface TransferFilters {
  include: string[];
  exclude: string[];
}

export interface TransferOptions {
  dryRun: boolean;
  checkFirst: boolean;
  trackRenames: boolean;
  createEmptySrcDirs: boolean;
  /**
   * `--ignore-errors`: keep going past a file rclone can't transfer (broken
   * Drive share, 404 on read, permission error…) instead of aborting the
   * whole run on the first one.
   */
  ignoreErrors: boolean;
  /** `--transfers`; null falls back to the global default. */
  transfers: number | null;
  checkers: number | null;
  /** `--bwlimit`, e.g. "10M" or "10M:1M". */
  bwlimit: string | null;
  /**
   * Only meaningful for `sync`: allow rclone to delete files at the destination
   * that no longer exist at the source. Destructive; guarded by a typed
   * confirmation on both the UI and the API.
   */
  deleteOnDst: boolean;
  filters: TransferFilters;
}

export const DEFAULT_TRANSFER_OPTIONS: TransferOptions = {
  dryRun: false,
  checkFirst: false,
  trackRenames: false,
  createEmptySrcDirs: true,
  ignoreErrors: false,
  transfers: null,
  checkers: null,
  bwlimit: null,
  deleteOnDst: false,
  filters: { include: [], exclude: [] },
};

export type SchedulePreset =
  | 'manual'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom';

export interface Job {
  id: string;
  name: string;
  mode: JobMode;
  source: RemotePath;
  destinations: RemotePath[];
  options: TransferOptions;
  /** Standard 5-field cron expression; null means "manual only". */
  cron: string | null;
  timezone: string;
  enabled: boolean;
  webhookUrl: string | null;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun: Run | null;
  nextRunAt: string | null;
  /** Human-readable schedule, e.g. "Todos los días a las 03:00". */
  scheduleLabel: string;
}

export interface CronPreview {
  valid: boolean;
  description: string;
  next: string[];
  error?: string;
}
