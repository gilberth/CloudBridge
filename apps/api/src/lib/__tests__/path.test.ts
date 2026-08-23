import { describe, expect, it } from 'vitest';
import {
  baseName,
  isRootPath,
  joinPath,
  parentPath,
  sanitizeName,
  sanitizePath,
  sanitizeRemoteName,
} from '../path.js';

describe('sanitizePath', () => {
  it('rejects ".." traversal anywhere in the path', () => {
    expect(() => sanitizePath('../etc/passwd')).toThrow();
    expect(() => sanitizePath('a/../../b')).toThrow();
    expect(() => sanitizePath('/a/b/../../../etc')).toThrow();
  });

  it('collapses "." and empty segments', () => {
    expect(sanitizePath('a/./b//c')).toBe('a/b/c');
    expect(sanitizePath('./a/')).toBe('a');
  });

  it('preserves a leading slash, required by local remotes', () => {
    expect(sanitizePath('/srv/data')).toBe('/srv/data');
    expect(sanitizePath('srv/data')).toBe('srv/data');
  });

  it('rejects NUL bytes and over-long paths', () => {
    expect(() => sanitizePath('a\0b')).toThrow();
    expect(() => sanitizePath('a'.repeat(5000))).toThrow();
  });

  it('treats an empty or root-only path as the root', () => {
    expect(sanitizePath('')).toBe('');
    expect(sanitizePath('/')).toBe('/');
    expect(isRootPath('')).toBe(true);
    expect(isRootPath('/')).toBe(true);
    expect(isRootPath('/a')).toBe(false);
  });
});

describe('sanitizeName', () => {
  it('rejects slashes, so a name cannot escape its directory', () => {
    expect(() => sanitizeName('a/b')).toThrow();
    expect(() => sanitizeName('..')).toThrow();
    expect(() => sanitizeName('.')).toThrow();
  });

  it('accepts an ordinary file name', () => {
    expect(sanitizeName('report (final).pdf')).toBe('report (final).pdf');
  });
});

describe('sanitizeRemoteName', () => {
  it('rejects a colon, which would break the remote:path syntax', () => {
    expect(() => sanitizeRemoteName('disco:evil')).toThrow();
  });

  it('accepts letters, digits, spaces, dot, dash and underscore', () => {
    expect(sanitizeRemoteName('gdrive-personal_2 v2')).toBe('gdrive-personal_2 v2');
  });
});

describe('joinPath / parentPath / baseName', () => {
  it('joins segments and re-sanitises the result', () => {
    expect(joinPath('/a/b', 'c', 'd')).toBe('/a/b/c/d');
    expect(joinPath('', 'a')).toBe('a');
  });

  it('computes the parent of an absolute and a relative path', () => {
    expect(parentPath('/a/b/c')).toBe('/a/b');
    expect(parentPath('/a')).toBe('/');
    expect(parentPath('a/b')).toBe('a');
    expect(parentPath('a')).toBe('');
  });

  it('extracts the last segment', () => {
    expect(baseName('/a/b/c.txt')).toBe('c.txt');
    expect(baseName('c.txt')).toBe('c.txt');
  });
});
