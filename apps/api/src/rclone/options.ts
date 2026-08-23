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

  const bwlimit = options.bwlimit ?? defaults.bwlimit;
  if (bwlimit) config.BwLimit = bwlimit;

  return config;
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
