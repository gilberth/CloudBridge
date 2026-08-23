import { describe, expect, it } from 'vitest';
import { buildConfig, buildFilter, parseBandwidth, syncEndpointFor } from '../options.js';
import { DEFAULT_TRANSFER_OPTIONS } from '@cloudbridge/shared';

describe('buildConfig', () => {
  const defaults = { transfers: 4, checkers: 8, bwlimit: null };

  it('falls back to the global defaults when transfers/checkers are unset', () => {
    expect(buildConfig({}, defaults)).toEqual({ Transfers: 4, Checkers: 8 });
  });

  it('lets a per-run value override the defaults', () => {
    expect(buildConfig({ transfers: 2, checkers: 16 }, defaults)).toEqual({
      Transfers: 2,
      Checkers: 16,
    });
  });

  it('never emits BwLimit: it is silently ignored by the rc API', () => {
    const config = buildConfig({ ...DEFAULT_TRANSFER_OPTIONS, bwlimit: '10M' }, defaults);
    expect(config).not.toHaveProperty('BwLimit');
  });

  it('sets the boolean flags only when true', () => {
    expect(buildConfig({ dryRun: true, checkFirst: true, trackRenames: true }, defaults)).toMatchObject({
      DryRun: true,
      CheckFirst: true,
      TrackRenames: true,
    });
    expect(buildConfig({}, defaults)).not.toHaveProperty('DryRun');
  });
});

describe('buildFilter', () => {
  it('omits empty include/exclude arrays', () => {
    expect(buildFilter({ include: [], exclude: [] })).toEqual({});
  });

  it('maps to IncludeRule/ExcludeRule', () => {
    expect(buildFilter({ include: ['*.jpg'], exclude: ['tmp/**'] })).toEqual({
      IncludeRule: ['*.jpg'],
      ExcludeRule: ['tmp/**'],
    });
  });
});

describe('syncEndpointFor', () => {
  it('routes copy, move and bisync directly', () => {
    expect(syncEndpointFor('copy', false)).toBe('sync/copy');
    expect(syncEndpointFor('move', false)).toBe('sync/move');
    expect(syncEndpointFor('bisync', false)).toBe('sync/bisync');
  });

  it('sync without deletion is a copy: rclone has no non-destructive sync', () => {
    expect(syncEndpointFor('sync', false)).toBe('sync/copy');
  });

  it('sync with deletion enabled uses sync/sync', () => {
    expect(syncEndpointFor('sync', true)).toBe('sync/sync');
  });
});

describe('parseBandwidth', () => {
  it('parses a bare number as KiB', () => {
    expect(parseBandwidth('10')).toBe(10 * 1024);
  });

  it('parses binary-multiple suffixes', () => {
    expect(parseBandwidth('10M')).toBe(10 * 1024 ** 2);
    expect(parseBandwidth('1G')).toBe(1024 ** 3);
  });

  it('takes only the upload half of an "up:down" pair', () => {
    expect(parseBandwidth('10M:1M')).toBe(10 * 1024 ** 2);
  });

  it('treats "off" and empty values as no limit', () => {
    expect(parseBandwidth('off')).toBeNull();
    expect(parseBandwidth(null)).toBeNull();
    expect(parseBandwidth('')).toBeNull();
  });

  it('returns null for an unparseable value instead of throwing', () => {
    expect(parseBandwidth('not-a-limit')).toBeNull();
  });
});
