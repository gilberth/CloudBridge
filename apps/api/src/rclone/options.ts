import type { TransferFilters, TransferOptions } from '@cloudbridge/shared';

export interface GlobalDefaults {
  transfers: number;
  checkers: number;
  bwlimit: string | null;
}


/**
 * Map CloudBridge transfer options onto rclone's `_config` block, which mirrors
 * the Go field names of `fs.ConfigInfo` (DryRun, Transfers, BwLimit…).
 */
export function buildConfig(
  options: Partial<TransferOptions>,
  defaults: GlobalDefaults,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    Transfers: options.transfers ?? defaults.transfers,
    Checkers: options.checkers ?? defaults.checkers,
  };
  if (options.dryRun) config.DryRun = true;
  if (options.checkFirst) config.CheckFirst = true;
  if (options.trackRenames) config.TrackRenames = true;

  // BwLimit is deliberately absent: rclone's bandwidth limiter is a single
  // process-wide token bucket, so a value passed in `_config` is accepted and
  // then ignored. Limits go through `core/bwlimit` — see BandwidthManager.
  return config;
}

/**
 * Parse an rclone bandwidth string ("10M", "1.5MiB", "10M:1M") into bytes per
 * second, so competing limits can be compared. Returns null for "off" or an
 * unparseable value.
 */
export function parseBandwidth(value: string | null | undefined): number | null {
  if (!value) return null;
  const first = value.split(':')[0]?.trim();
  if (!first || first.toLowerCase() === 'off') return null;

  const match = /^(\d+(?:\.\d+)?)\s*([KMGTP]i?B?)?$/i.exec(first);
  if (!match?.[1]) return null;

  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] ?? '').toUpperCase().replace(/I?B$/, '');
  const exponent = ['', 'K', 'M', 'G', 'T', 'P'].indexOf(unit);
  if (exponent === -1) return null;
  // rclone reads bare numbers as KiB and suffixes as binary multiples.
  return Math.round(amount * (unit === '' ? 1024 : 1024 ** exponent));
}

/** Map include/exclude patterns onto rclone's `_filter` block. */
export function buildFilter(filters?: TransferFilters): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (filters?.include?.length) filter.IncludeRule = filters.include;
  if (filters?.exclude?.length) filter.ExcludeRule = filters.exclude;
  return filter;
}

/**
 * rclone has no "sync without deleting": that is exactly what `copy` does.
 * A job saved as `sync` with the destructive toggle off therefore runs
 * `sync/copy`; only with `deleteOnDst` does it run `sync/sync`.
 */
export function syncEndpointFor(
  mode: 'copy' | 'sync' | 'move' | 'bisync',
  deleteOnDst: boolean,
): 'sync/copy' | 'sync/move' | 'sync/sync' | 'sync/bisync' {
  switch (mode) {
    case 'copy':
      return 'sync/copy';
    case 'move':
      return 'sync/move';
    case 'bisync':
      return 'sync/bisync';
    case 'sync':
      return deleteOnDst ? 'sync/sync' : 'sync/copy';
  }
}
