import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { RcloneClient } from '../../rclone/client.js';
import { RemotesService } from '../remotes.js';

const onedriveQuestion = {
  State: '*oauth-confirm,choose_type,,',
  Option: {
    Name: 'config_type',
    Help: 'Type of connection',
    Default: 'onedrive',
    Examples: [{ Value: 'onedrive', Help: 'OneDrive Personal or Business' }],
    Required: false,
    IsPassword: false,
    Type: 'string',
    Exclusive: true,
    Advanced: false,
  },
  Error: '',
};

describe('RemotesService config import', () => {
  it('preserves secrets that are already obscured in rclone.conf', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const endpoint = String(input).split('/').at(-1);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

      if (endpoint === 'listremotes') return Response.json({ remotes: [] });

      expect(endpoint).toBe('create');
      expect(body).toEqual({
        name: 'icloud-lxc',
        type: 'iclouddrive',
        parameters: {
          apple_id: 'cuenta@example.com',
          password: 'secreto-ya-ofuscado',
          trust_token: 'token-ya-ofuscado',
        },
        opt: { nonInteractive: true, noObscure: true },
      });
      return Response.json({});
    });
    const app = {
      rclone: new RcloneClient({
        url: 'http://rclone.internal:5572',
        user: 'cloudbridge',
        password: 'secret',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    } as unknown as FastifyInstance;

    const imported = await new RemotesService(app).importConfig(`[icloud-lxc]
type = iclouddrive
apple_id = cuenta@example.com
password = secreto-ya-ofuscado
trust_token = token-ya-ofuscado
`);

    expect(imported).toBe(1);
  });

  it('preserves obscured secrets when replacing an existing remote', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const endpoint = String(input).split('/').at(-1);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

      if (endpoint === 'listremotes') return Response.json({ remotes: ['icloud-lxc'] });

      expect(endpoint).toBe('update');
      expect(body).toEqual({
        name: 'icloud-lxc',
        parameters: {
          type: 'iclouddrive',
          apple_id: 'cuenta@example.com',
          password: 'secreto-ya-ofuscado',
        },
        opt: { nonInteractive: true, noObscure: true },
      });
      return Response.json({});
    });
    const app = {
      rclone: new RcloneClient({
        url: 'http://rclone.internal:5572',
        user: 'cloudbridge',
        password: 'secret',
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    } as unknown as FastifyInstance;

    const imported = await new RemotesService(app).importConfig(`[icloud-lxc]
type = iclouddrive
apple_id = cuenta@example.com
password = secreto-ya-ofuscado
`);

    expect(imported).toBe(1);
  });
});

describe('RemotesService configuration wizard', () => {
  it('uses a pasted OAuth token without asking rclone to replace it', async () => {
    const configCreate = vi.fn().mockResolvedValue(onedriveQuestion);
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue([]),
        configCreate,
      },
    } as unknown as FastifyInstance;

    await new RemotesService(app).create(
      'onedrive-token',
      'onedrive',
      {},
      '{"access_token":"token","refresh_token":"refresh"}',
      'user-1',
    );

    expect(configCreate).toHaveBeenCalledWith('onedrive-token', 'onedrive', {
      token: '{"access_token":"token","refresh_token":"refresh"}',
      config_refresh_token: 'false',
      token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    });
  });

  it('uses a replacement OAuth token without asking rclone to replace it', async () => {
    const configUpdate = vi.fn().mockResolvedValue(onedriveQuestion);
    const app = {
      rclone: {
        configGet: vi.fn().mockResolvedValue({ type: 'onedrive', token: 'old-token' }),
        configUpdate,
      },
    } as unknown as FastifyInstance;

    await new RemotesService(app).update(
      'onedrive-token',
      {},
      '{"access_token":"new-token","refresh_token":"new-refresh"}',
      'user-1',
    );

    expect(configUpdate).toHaveBeenCalledWith('onedrive-token', {
      token: '{"access_token":"new-token","refresh_token":"new-refresh"}',
      config_refresh_token: 'false',
      token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    });
  });

  it('provides the OneDrive token endpoint when an existing token needs renewal', async () => {
    const configUpdate = vi.fn().mockResolvedValue(onedriveQuestion);
    const app = {
      rclone: {
        configGet: vi.fn().mockResolvedValue({
          type: 'onedrive',
          token: '{"access_token":"expired","refresh_token":"refresh"}',
        }),
        configUpdate,
      },
    } as unknown as FastifyInstance;

    await new RemotesService(app).update('onedrive-token', {}, undefined, 'user-1');

    expect(configUpdate).toHaveBeenCalledWith('onedrive-token', {
      config_refresh_token: 'false',
      token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    });
  });

  it('derives the OneDrive token endpoint from its cloud region and tenant', async () => {
    const configUpdate = vi.fn().mockResolvedValue(onedriveQuestion);
    const app = {
      rclone: {
        configGet: vi.fn().mockResolvedValue({
          type: 'onedrive',
          token: '{"access_token":"expired","refresh_token":"refresh"}',
          region: 'us',
          tenant: 'tenant-id',
        }),
        configUpdate,
      },
    } as unknown as FastifyInstance;

    await new RemotesService(app).update('onedrive-us', {}, undefined, 'user-1');

    expect(configUpdate).toHaveBeenCalledWith('onedrive-us', {
      config_refresh_token: 'false',
      token_url: 'https://login.microsoftonline.us/tenant-id/oauth2/v2.0/token',
    });
  });

  it('returns the next rclone question instead of probing an incomplete remote', async () => {
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue([]),
        configCreate: vi.fn().mockResolvedValue(onedriveQuestion),
        about: vi.fn().mockResolvedValue({ total: 100, used: 10 }),
      },
    } as unknown as FastifyInstance;

    const result = await new RemotesService(app).create(
      'onedrive',
      'onedrive',
      {},
      '{"access_token":"token"}',
      'user-1',
    );

    expect(result).toEqual({
      status: 'question',
      setupId: expect.any(String),
      remoteName: 'onedrive',
      state: '*oauth-confirm,choose_type,,',
      option: {
        name: 'config_type',
        help: 'Type of connection',
        default: 'onedrive',
        examples: [{ value: 'onedrive', help: 'OneDrive Personal or Business' }],
        required: false,
        isPassword: false,
        type: 'string',
        exclusive: true,
      },
    });
  });

  it('returns each subsequent question while rclone keeps a non-empty state', async () => {
    const driveQuestion = {
      State: 'driveid_final',
      Option: {
        Name: 'config_driveid',
        Help: 'Select drive you want to use',
        Default: 'drive-personal',
        Examples: [
          { Value: 'drive-personal', Help: 'Personal OneDrive' },
          { Value: 'drive-library', Help: 'Documents' },
        ],
        Required: true,
        IsPassword: false,
        Type: 'string',
        Exclusive: true,
      },
      Error: '',
    };
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue([]),
        configCreate: vi.fn().mockResolvedValue(onedriveQuestion),
        configContinue: vi.fn().mockResolvedValue(driveQuestion),
      },
    } as unknown as FastifyInstance;

    const service = new RemotesService(app);
    const started = await service.create(
      'onedrive',
      'onedrive',
      {},
      '{"access_token":"token"}',
      'user-1',
    );
    if (started.status !== 'question') throw new Error('Expected setup question');

    const result = await service.continueSetup(
      'onedrive',
      started.setupId,
      'user-1',
      '*oauth-confirm,choose_type,,',
      'onedrive',
    );

    expect(result).toEqual({
      status: 'question',
      setupId: started.setupId,
      remoteName: 'onedrive',
      state: 'driveid_final',
      option: {
        name: 'config_driveid',
        help: 'Select drive you want to use',
        default: 'drive-personal',
        examples: [
          { value: 'drive-personal', help: 'Personal OneDrive' },
          { value: 'drive-library', help: 'Documents' },
        ],
        required: true,
        isPassword: false,
        type: 'string',
        exclusive: true,
      },
    });
  });

  it('surfaces an error-only rclone state instead of completing an invalid remote', async () => {
    const graphError =
      'Failed to query available drives: microsoft graph rejected the request';
    const configGet = vi.fn();
    const about = vi.fn();
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue([]),
        configCreate: vi.fn().mockResolvedValue(onedriveQuestion),
        configContinue: vi.fn().mockResolvedValue({
          State: 'choose_type',
          Option: null,
          Error: graphError,
          Result: '',
        }),
        configGet,
        about,
      },
    } as unknown as FastifyInstance;

    const service = new RemotesService(app);
    const started = await service.create(
      'onedrive-error',
      'onedrive',
      {},
      '{"access_token":"token"}',
      'user-1',
    );
    if (started.status !== 'question') throw new Error('Expected setup question');

    await expect(
      service.continueSetup(
        'onedrive-error',
        started.setupId,
        'user-1',
        started.state,
        'onedrive',
      ),
    ).rejects.toMatchObject({ statusCode: 400, message: graphError });
    expect(configGet).not.toHaveBeenCalled();
    expect(about).not.toHaveBeenCalled();
  });

  it('probes and returns the remote after rclone finishes the setup', async () => {
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue([]),
        configCreate: vi.fn().mockResolvedValue(onedriveQuestion),
        configContinue: vi.fn().mockResolvedValue({ State: '', Error: '' }),
        configGet: vi.fn().mockResolvedValue({
          type: 'onedrive',
          drive_id: 'drive-personal',
          drive_type: 'personal',
        }),
        about: vi.fn().mockResolvedValue({ total: 100, used: 10 }),
      },
    } as unknown as FastifyInstance;

    const service = new RemotesService(app);
    const started = await service.create(
      'onedrive',
      'onedrive',
      {},
      '{"access_token":"token"}',
      'user-1',
    );
    if (started.status !== 'question') throw new Error('Expected setup question');

    const result = await service.continueSetup(
      'onedrive',
      started.setupId,
      'user-1',
      'driveid_final_end',
      'true',
    );

    expect(result).toEqual({
      status: 'complete',
      remote: {
        name: 'onedrive',
        type: 'onedrive',
        online: true,
        about: { total: 100, used: 10 },
      },
    });
  });

  it('can resume setup when editing an existing incomplete remote', async () => {
    const app = {
      rclone: {
        configGet: vi.fn().mockResolvedValue({ type: 'onedrive', token: 'masked-token' }),
        configUpdate: vi.fn().mockResolvedValue(onedriveQuestion),
        about: vi.fn().mockResolvedValue({ total: 100, used: 10 }),
      },
    } as unknown as FastifyInstance;

    const result = await new RemotesService(app).update(
      'onedrive',
      {},
      undefined,
      'user-1',
    );

    expect(result).toMatchObject({
      status: 'question',
      remoteName: 'onedrive',
      state: '*oauth-confirm,choose_type,,',
      option: { name: 'config_type' },
    });
  });

  it('reuses the original parameters throughout every continuation', async () => {
    const configContinue = vi.fn().mockResolvedValue({
      ...onedriveQuestion,
      State: 'driveid_final',
    });
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue([]),
        configCreate: vi.fn().mockResolvedValue(onedriveQuestion),
        configContinue,
      },
    } as unknown as FastifyInstance;
    const service = new RemotesService(app);

    const started = await service.create(
      'onedrive-2',
      'onedrive',
      { region: 'global' },
      '{"access_token":"token"}',
      'user-1',
    );
    if (started.status !== 'question') throw new Error('Expected setup question');
    await service.continueSetup(
      'onedrive-2',
      started.setupId,
      'user-1',
      onedriveQuestion.State,
      'onedrive',
    );

    expect(configContinue).toHaveBeenCalledWith(
      'create',
      'onedrive-2',
      'onedrive',
      onedriveQuestion.State,
      'onedrive',
      {
        region: 'global',
        token: '{"access_token":"token"}',
        config_refresh_token: 'false',
        token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      },
    );
  });

  it('removes a newly created partial remote when its wizard is cancelled', async () => {
    const configDelete = vi.fn().mockResolvedValue({});
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue([]),
        configCreate: vi.fn().mockResolvedValue(onedriveQuestion),
        configDelete,
      },
    } as unknown as FastifyInstance;
    const service = new RemotesService(app);
    const started = await service.create(
      'cancelled',
      'onedrive',
      {},
      '{"access_token":"token"}',
      'user-1',
    );
    if (started.status !== 'question') throw new Error('Expected setup question');

    const removed = await service.cancelSetup('cancelled', started.setupId, 'user-1');

    expect(removed).toBe(true);
    expect(configDelete).toHaveBeenCalledWith('cancelled');
  });

  it('rejects a continuation when the opaque setup session belongs to another user', async () => {
    const configContinue = vi.fn();
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue([]),
        configCreate: vi.fn().mockResolvedValue(onedriveQuestion),
        configContinue,
      },
    } as unknown as FastifyInstance;
    const service = new RemotesService(app);
    const started = await service.create(
      'onedrive',
      'onedrive',
      {},
      '{"access_token":"token"}',
      'owner-user',
    );
    if (started.status !== 'question') throw new Error('Expected setup question');

    await expect(
      service.continueSetup(
        'onedrive',
        started.setupId,
        'other-user',
        started.state,
        'onedrive',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(configContinue).not.toHaveBeenCalled();
  });

  it('does not delete an existing remote when its edit wizard is cancelled', async () => {
    const configDelete = vi.fn();
    const app = {
      rclone: {
        configGet: vi.fn().mockResolvedValue({ type: 'onedrive' }),
        configUpdate: vi.fn().mockResolvedValue(onedriveQuestion),
        configDelete,
      },
    } as unknown as FastifyInstance;
    const service = new RemotesService(app);
    const started = await service.update('existing', {}, undefined, 'user-1');
    if (started.status !== 'question') throw new Error('Expected setup question');

    const removed = await service.cancelSetup('existing', started.setupId, 'user-1');

    expect(removed).toBe(false);
    expect(configDelete).not.toHaveBeenCalled();
  });
});
