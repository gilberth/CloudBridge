import { describe, expect, it } from 'vitest';
import { fsAndRemote, fsPath, fsRoot, serverSideOptions } from '../fsstring.js';

describe('fsRoot / fsPath', () => {
  it('builds a bare remote root', () => {
    expect(fsRoot('disco')).toBe('disco:');
  });

  it('appends connection-string options', () => {
    expect(fsRoot('drive', { server_side_across_configs: 'true' })).toBe(
      'drive,server_side_across_configs=true:',
    );
  });

  it('quotes an option value that needs it', () => {
    expect(fsRoot('s3', { region: 'us east 1' })).toBe('s3,region="us east 1":');
  });

  it('joins the root and the sanitised path', () => {
    expect(fsPath('disco', '/srv/data')).toBe('disco:/srv/data');
    expect(fsPath('disco', '')).toBe('disco:');
  });
});

describe('fsAndRemote', () => {
  it('splits a relative path into its parent fs and leaf name', () => {
    expect(fsAndRemote('disco', 'a/b/c.txt')).toEqual({ fs: 'disco:a/b', remote: 'c.txt' });
  });

  it('keeps the leading slash on the parent of an absolute path', () => {
    expect(fsAndRemote('disco', '/a')).toEqual({ fs: 'disco:/', remote: 'a' });
  });

  it('has no parent directory for a top-level relative entry', () => {
    expect(fsAndRemote('disco', 'a.txt')).toEqual({ fs: 'disco:', remote: 'a.txt' });
  });
});

describe('serverSideOptions', () => {
  it('adds server_side_across_configs for a Drive-to-Drive transfer', () => {
    // https://forum.rclone.org/t/drive-shared-with-me-problem/13663/2 — without
    // this flag rclone downloads and re-uploads instead of copying server-side.
    expect(serverSideOptions('drive', 'drive')).toEqual({ server_side_across_configs: 'true' });
  });

  it('returns undefined for any other pairing', () => {
    expect(serverSideOptions('drive', 's3')).toBeUndefined();
    expect(serverSideOptions('s3', 's3')).toBeUndefined();
  });
});
