import { badRequest } from './errors.js';

const MAX_PATH_LENGTH = 4096;

/**
 * Normalise a path that came from a client into a safe, remote-relative path.
 *
 * Every `remote:path` string handed to rclone must go through here: it strips
 * empty and `.` segments, rejects `..` traversal, NUL bytes and over-long
 * inputs, and always returns a path without leading or trailing slashes.
 */
export function sanitizePath(input: string | undefined | null): string {
  const raw = (input ?? '').trim();
  if (raw.length > MAX_PATH_LENGTH) throw badRequest('La ruta es demasiado larga');
  if (raw.includes('\0')) throw badRequest('La ruta contiene caracteres inválidos');

  const segments: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') throw badRequest('La ruta no puede contener ".."');
    segments.push(segment);
  }
  return segments.join('/');
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
  return sanitizePath([base, ...parts].join('/'));
}

/** Parent directory of a remote-relative path (`''` for the root). */
export function parentPath(path: string): string {
  const clean = sanitizePath(path);
  const index = clean.lastIndexOf('/');
  return index === -1 ? '' : clean.slice(0, index);
}

export function baseName(path: string): string {
  const clean = sanitizePath(path);
  const index = clean.lastIndexOf('/');
  return index === -1 ? clean : clean.slice(index + 1);
}
