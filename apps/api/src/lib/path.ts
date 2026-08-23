import { badRequest } from './errors.js';

const MAX_PATH_LENGTH = 4096;

/**
 * Normalise a client-supplied path into a safe path for rclone.
 *
 * Every `remote:path` string handed to rclone goes through here: it drops empty
 * and `.` segments, rejects `..` traversal, NUL bytes and over-long inputs.
 *
 * A leading slash is preserved. `local` remotes address the filesystem with
 * absolute paths (`disco:/srv/data`), while object-store backends trim leading
 * slashes themselves, so keeping it is both necessary and harmless. Traversal
 * safety comes from rejecting `..`, not from forbidding the leading slash.
 */
export function sanitizePath(input: string | undefined | null): string {
  // No `.trim()` here: a trailing/leading space on the *last* path segment is
  // a legitimate character in a real remote name (Google Drive allows it),
  // and trimming the whole string silently mangles it into a path rclone
  // can't find — see "directory not found" on folders like "Foo Bar ".
  const raw = input ?? '';
  if (raw.length > MAX_PATH_LENGTH) throw badRequest('La ruta es demasiado larga');
  if (raw.includes('\0')) throw badRequest('La ruta contiene caracteres inválidos');

  const absolute = raw.startsWith('/');
  const segments: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') throw badRequest('La ruta no puede contener ".."');
    segments.push(segment);
  }

  return `${absolute ? '/' : ''}${segments.join('/')}`;
}

/**
 * A single path segment (a file or directory name) — no slashes allowed, so it
 * cannot be used to escape the directory it is listed in.
 */
export function sanitizeName(input: string): string {
  const name = input.trim();
  if (!name) throw badRequest('El nombre no puede estar vacío');
  if (name === '.' || name === '..') throw badRequest('Nombre inválido');
  if (name.includes('/') || name.includes('\0')) throw badRequest('El nombre no puede contener "/"');
  if (name.length > 255) throw badRequest('El nombre es demasiado largo');
  return name;
}

const REMOTE_NAME_RE = /^[A-Za-z0-9_.\- ]+$/;

export function sanitizeRemoteName(input: string): string {
  const name = input.trim();
  if (!name || !REMOTE_NAME_RE.test(name)) throw badRequest(`Nombre de remoto inválido: "${input}"`);
  return name;
}

export function joinPath(base: string, ...parts: string[]): string {
  const clean = sanitizePath(base);
  const suffix = parts.join('/');
  if (!suffix) return clean;
  if (!clean) return sanitizePath(suffix);
  return sanitizePath(clean === '/' ? `/${suffix}` : `${clean}/${suffix}`);
}

/** Parent directory of a path; `''` (or `'/'` when absolute) at the top. */
export function parentPath(path: string): string {
  const clean = sanitizePath(path);
  const index = clean.lastIndexOf('/');
  if (index === -1) return '';
  if (index === 0) return '/';
  return clean.slice(0, index);
}

export function baseName(path: string): string {
  const clean = sanitizePath(path);
  const index = clean.lastIndexOf('/');
  return index === -1 ? clean : clean.slice(index + 1);
}

/** True when the path addresses the root of its remote. */
export function isRootPath(path: string): boolean {
  const clean = sanitizePath(path);
  return clean === '' || clean === '/';
}
