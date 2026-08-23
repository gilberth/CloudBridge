import { sanitizePath, sanitizeRemoteName } from '../lib/path.js';

/**
 * Backend overrides applied to a single call through rclone's connection-string
 * syntax (`remote,key=value:path`). Used for things that cannot be expressed as
 * a global `_config` flag, such as `--drive-server-side-across-configs`.
 */
export type BackendOptions = Record<string, string>;

function encodeValue(value: string): string {
  if (/^[A-Za-z0-9_.\-/]*$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** `drive:` or `drive,server_side_across_configs=true:` */
export function fsRoot(remote: string, options?: BackendOptions): string {
  const name = sanitizeRemoteName(remote);
  const entries = Object.entries(options ?? {});
  if (entries.length === 0) return `${name}:`;
  const suffix = entries.map(([key, value]) => `${key}=${encodeValue(value)}`).join(',');
  return `${name},${suffix}:`;
}

/** Full filesystem string for sync-style calls: `drive:media/photos`. */
export function fsPath(remote: string, path: string, options?: BackendOptions): string {
  return `${fsRoot(remote, options)}${sanitizePath(path)}`;
}

/**
 * Split into the `fs` + `remote` pair that `operations/*` endpoints expect.
 * The directory becomes part of `fs` and the trailing entry becomes `remote`.
 */
export function fsAndRemote(
  remote: string,
  path: string,
  options?: BackendOptions,
): { fs: string; remote: string } {
  const clean = sanitizePath(path);
  const index = clean.lastIndexOf('/');
  const dir = index === -1 ? '' : clean.slice(0, index);
  const leaf = index === -1 ? clean : clean.slice(index + 1);
  return { fs: fsPath(remote, dir, options), remote: leaf };
}

/**
 * Server-side transfers between two Google Drive configs need this flag or
 * rclone downloads and re-uploads every file.
 * See https://forum.rclone.org/t/drive-shared-with-me-problem/13663/2
 */
export function serverSideOptions(srcType: string, dstType: string): BackendOptions | undefined {
  if (srcType === 'drive' && dstType === 'drive') {
    return { server_side_across_configs: 'true' };
  }
  return undefined;
}
