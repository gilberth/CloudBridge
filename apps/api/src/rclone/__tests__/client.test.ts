import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RcloneClient, RcloneError, RcloneUnavailableError } from '../client.js';

/** Build a fetch mock that always answers with the given JSON body. */
function mockFetch(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function client(fetchImpl: typeof fetch) {
  return new RcloneClient({
    url: 'http://rclone.internal:5572',
    user: 'cloudbridge',
    password: 'secret',
    fetchImpl,
  });
}

describe('RcloneClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch({ ok: true });
  });

  it('sends HTTP Basic auth built from user and password', async () => {
    await client(fetchMock as unknown as typeof fetch).call('core/version');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from('cloudbridge:secret').toString('base64')}`);
  });

  it('posts to <url>/<endpoint> with a JSON body', async () => {
    await client(fetchMock as unknown as typeof fetch).call('operations/list', { fs: 'disco:', remote: '' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://rclone.internal:5572/operations/list');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ fs: 'disco:', remote: '' });
  });

  it('adds _async, _group, _config and _filter only when provided', async () => {
    await client(fetchMock as unknown as typeof fetch).call(
      'sync/copy',
      { srcFs: 'a:', dstFs: 'b:' },
      { async: true, group: 'run:1', config: { DryRun: true }, filter: { IncludeRule: ['*.jpg'] } },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      srcFs: 'a:',
      dstFs: 'b:',
      _async: true,
      _group: 'run:1',
      _config: { DryRun: true },
      _filter: { IncludeRule: ['*.jpg'] },
    });
  });

  it('omits empty _config and _filter blocks', async () => {
    await client(fetchMock as unknown as typeof fetch).call('sync/copy', {}, { config: {}, filter: {} });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('_config');
    expect(body).not.toHaveProperty('_filter');
  });

  it('callAsync returns the jobid from an _async response', async () => {
    fetchMock = mockFetch({ jobid: 42 });
    const jobId = await client(fetchMock as unknown as typeof fetch).callAsync('sync/copy', {
      srcFs: 'a:',
      dstFs: 'b:',
    });
    expect(jobId).toBe(42);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)._async).toBe(true);
  });

  it('callAsync throws RcloneError when no jobid comes back', async () => {
    fetchMock = mockFetch({ ok: true });
    await expect(
      client(fetchMock as unknown as typeof fetch).callAsync('sync/copy', {}),
    ).rejects.toBeInstanceOf(RcloneError);
  });

  it('throws RcloneError with the daemon message on a non-2xx response', async () => {
    fetchMock = mockFetch({ error: 'directory not found' }, { status: 404 });
    await expect(
      client(fetchMock as unknown as typeof fetch).call('operations/list', {}),
    ).rejects.toMatchObject({ message: 'directory not found', status: 404 });
  });

  it('maps a 401/403 to a credentials-rejected message, hiding rclone internals', async () => {
    fetchMock = mockFetch({ error: 'auth failure' }, { status: 401 });
    await expect(
      client(fetchMock as unknown as typeof fetch).call('core/version'),
    ).rejects.toMatchObject({ message: 'Credenciales de la RC API rechazadas' });
  });

  it('throws RcloneUnavailableError when the daemon cannot be reached', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      client(failing as unknown as typeof fetch).call('core/version'),
    ).rejects.toBeInstanceOf(RcloneUnavailableError);
  });

  it('parses a non-JSON body without throwing, as { error: text }', async () => {
    fetchMock = vi.fn(
      async () => new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } }),
    );
    await expect(
      client(fetchMock as unknown as typeof fetch).call('core/version'),
    ).rejects.toMatchObject({ message: 'Not Found' });
  });

  it('stats() forwards the group when given, and omits it otherwise', async () => {
    fetchMock = mockFetch({ bytes: 0 });
    await client(fetchMock as unknown as typeof fetch).stats('run:1');
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      group: 'run:1',
    });

    await client(fetchMock as unknown as typeof fetch).stats();
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)).toEqual({});
  });

  it('obscures plain secrets when creating a remote from the GUI', async () => {
    await client(fetchMock as unknown as typeof fetch).configCreate('icloud', 'iclouddrive', {
      password: 'plain-secret',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'icloud',
      type: 'iclouddrive',
      parameters: { password: 'plain-secret' },
      opt: { nonInteractive: true, obscure: true },
    });
  });

  it('continues a new remote through config/create with the exact state and answer', async () => {
    fetchMock = mockFetch({ State: '', Error: '' });

    await client(fetchMock as unknown as typeof fetch).configContinue(
      'create',
      'onedrive',
      'onedrive',
      '*oauth-confirm,choose_type,,',
      'onedrive',
      { token: 'oauth-token', region: 'global' },
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://rclone.internal:5572/config/create');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'onedrive',
      type: 'onedrive',
      parameters: { token: 'oauth-token', region: 'global' },
      opt: {
        nonInteractive: true,
        continue: true,
        state: '*oauth-confirm,choose_type,,',
        result: 'onedrive',
      },
    });
  });

  it('check() sets sensible defaults for the comparison flags', async () => {
    fetchMock = mockFetch({ combined: [] });
    await client(fetchMock as unknown as typeof fetch).check('a:', 'b:');

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({
      srcFs: 'a:',
      dstFs: 'b:',
      combined: true,
      missingOnSrc: true,
      missingOnDst: true,
      match: true,
      differ: true,
      error: true,
    });
  });
});
