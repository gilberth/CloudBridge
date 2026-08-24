import type {
  ProviderInfo,
  RemoteSetupResult,
  RemoteAbout,
  RemoteDetail,
  RemoteSummary,
} from '@cloudbridge/shared';
import { OAUTH_PROVIDERS } from '@cloudbridge/shared';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { maskSecret } from '../lib/crypto.js';
import { sanitizeRemoteName } from '../lib/path.js';
import { fsRoot } from '../rclone/fsstring.js';
import { RcloneError, RcloneUnavailableError } from '../rclone/client.js';
import { env } from '../config/env.js';
import type { RcConfigResult } from '../rclone/types.js';

const OAUTH_SET = new Set<string>(OAUTH_PROVIDERS);
const SETUP_SESSION_TTL_MS = 30 * 60_000;
const ONEDRIVE_OAUTH_HOSTS: Record<string, string> = {
  global: 'https://login.microsoftonline.com',
  us: 'https://login.microsoftonline.us',
  de: 'https://login.microsoftonline.de',
  cn: 'https://login.chinacloudapi.cn',
};

/** Config keys that must never be echoed back to the browser in clear text. */
const SECRET_KEYS = /pass|secret|token|key$|_key|credentials|sa_file|auth/i;

interface CachedProbe {
  online: boolean;
  about: RemoteAbout | null;
  error?: string;
  at: number;
}

/**
 * Remote management on top of the rclone `config/*` endpoints. rclone owns the
 * configuration file; CloudBridge never writes it directly.
 */
export class RemotesService {
  private readonly probes = new Map<string, CachedProbe>();
  private readonly setupSessions = new Map<
    string,
    {
      remote: string;
      type: string;
      operation: 'create' | 'update';
      owner: string;
      parameters: Record<string, string>;
      created: boolean;
      expiresAt: number;
    }
  >();
  private providersCache: { at: number; value: ProviderInfo[] } | null = null;

  constructor(private readonly app: FastifyInstance) {}

  private get rclone() {
    // Read through the app so a Settings change swaps the client transparently.
    return this.app.rclone;
  }

  private setupQuestion(
    remoteName: string,
    setupId: string,
    result: RcConfigResult,
  ): RemoteSetupResult | null {
    const option = result.Option;
    if (!result.State) return null;
    if (!option) {
      throw badRequest(
        result.Error ||
          'rclone devolvió un estado de configuración pendiente sin una pregunta',
      );
    }
    return {
      status: 'question',
      setupId,
      remoteName,
      state: result.State,
      option: {
        name: option.Name,
        help: option.Help ?? '',
        default: option.Default,
        examples: option.Examples?.map((example) => ({
          value: example.Value,
          help: example.Help,
        })),
        required: Boolean(option.Required),
        isPassword: Boolean(option.IsPassword),
        type: option.Type ?? 'string',
        exclusive: Boolean(option.Exclusive),
      },
      ...(result.Error ? { error: result.Error } : {}),
    };
  }

  private startSetup(
    remote: string,
    type: string,
    operation: 'create' | 'update',
    owner: string,
    parameters: Record<string, string>,
    created: boolean,
    result: RcConfigResult,
  ): RemoteSetupResult | null {
    if (!result.State) return null;
    const setupId = randomUUID();
    const question = this.setupQuestion(remote, setupId, result);
    if (!question) return null;
    this.setupSessions.set(setupId, {
      remote,
      type,
      operation,
      owner,
      parameters,
      created,
      expiresAt: Date.now() + SETUP_SESSION_TTL_MS,
    });
    return question;
  }

  private requireSetup(setupId: string, remote: string, owner: string) {
    const session = this.setupSessions.get(setupId);
    if (
      !session ||
      session.remote !== remote ||
      session.owner !== owner ||
      session.expiresAt <= Date.now()
    ) {
      if (session?.expiresAt && session.expiresAt <= Date.now()) {
        this.setupSessions.delete(setupId);
      }
      throw conflict('La sesión de configuración expiró o ya no es válida');
    }
    return session;
  }

  private async completedSetup(remote: string, type: string): Promise<RemoteSetupResult> {
    this.invalidate(remote);
    const probe = await this.probe(remote, 0);
    return {
      status: 'complete',
      remote: {
        name: remote,
        type,
        online: probe.online,
        about: probe.about,
        ...(probe.error ? { error: probe.error } : {}),
      },
    };
  }

  async types(): Promise<Record<string, string>> {
    const dump = await this.rclone.configDump();
    return Object.fromEntries(
      Object.entries(dump).map(([name, config]) => [name, config.type ?? 'unknown']),
    );
  }

  /**
   * List remotes with a cached reachability probe. `about` is optional in
   * rclone: plenty of backends (S3, SFTP…) simply do not report quota.
   */
  async list(probe = true): Promise<RemoteSummary[]> {
    const types = await this.types();
    const names = Object.keys(types).sort((a, b) => a.localeCompare(b));

    return Promise.all(
      names.map(async (name) => {
        const type = types[name] ?? 'unknown';
        if (!probe) return { name, type, online: null, about: null };
        const result = await this.probe(name);
        return {
          name,
          type,
          online: result.online,
          about: result.about,
          ...(result.error ? { error: result.error } : {}),
        };
      }),
    );
  }

  async get(name: string): Promise<RemoteDetail> {
    const remote = sanitizeRemoteName(name);
    const config = await this.rclone.configGet(remote);
    if (!config || Object.keys(config).length === 0) {
      throw notFound(`El remoto "${remote}" no existe`);
    }

    const probe = await this.probe(remote);
    return {
      name: remote,
      type: config.type ?? 'unknown',
      online: probe.online,
      about: probe.about,
      ...(probe.error ? { error: probe.error } : {}),
      parameters: Object.fromEntries(
        Object.entries(config).map(([key, value]) => [
          key,
          SECRET_KEYS.test(key) && value ? maskSecret(value) : value,
        ]),
      ),
    };
  }

  /** Cheap liveness check: `operations/about`, falling back to a root listing. */
  async probe(name: string, maxAgeMs = 60_000): Promise<CachedProbe> {
    const cached = this.probes.get(name);
    if (cached && Date.now() - cached.at < maxAgeMs) return cached;

    const fs = fsRoot(name);
    let result: CachedProbe;
    try {
      const about = await this.rclone.about(fs);
      result = { online: true, about, at: Date.now() };
    } catch (error) {
      if (error instanceof RcloneUnavailableError) {
        result = { online: false, about: null, error: error.message, at: Date.now() };
      } else {
        // `about` is unsupported on many backends — a successful listing still
        // proves the remote works.
        try {
          await this.rclone.list(fs, '', { filesOnly: false, noModTime: true });
          result = { online: true, about: null, at: Date.now() };
        } catch (listError) {
          const message =
            listError instanceof RcloneError || listError instanceof RcloneUnavailableError
              ? listError.message
              : 'Error desconocido';
          result = { online: false, about: null, error: message, at: Date.now() };
        }
      }
    }

    this.probes.set(name, result);
    return result;
  }

  invalidate(name?: string): void {
    if (name) this.probes.delete(name);
    else this.probes.clear();
  }

  /**
   * rclone's OneDrive setup wizard can refresh a pasted/stored token while it
   * discovers drives. Supplying the endpoint explicitly prevents that refresh
   * from falling back to the base OAuth config, whose token URL is empty.
   */
  private addOnedriveTokenUrl(
    payload: Record<string, string>,
    current: Record<string, string> = {},
  ): void {
    if (payload.token_url || current.token_url) return;
    const region = payload.region || current.region || 'global';
    const host = ONEDRIVE_OAUTH_HOSTS[region];
    if (!host) return;
    const tenant = payload.tenant || current.tenant || 'common';
    payload.token_url = `${host}/${tenant}/oauth2/v2.0/token`;
  }

  async create(
    name: string,
    type: string,
    parameters: Record<string, string>,
    token: string | undefined,
    owner: string,
  ): Promise<RemoteSetupResult> {
    const remote = sanitizeRemoteName(name);
    const existing = await this.rclone.listRemotes();
    if (existing.includes(remote)) throw conflict(`Ya existe un remoto llamado "${remote}"`);

    const payload = { ...parameters };
    if (type === 'drive' && !payload.client_id) {
      const { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET } = env();
      if (GOOGLE_DRIVE_CLIENT_ID && GOOGLE_DRIVE_CLIENT_SECRET) {
        payload.client_id = GOOGLE_DRIVE_CLIENT_ID;
        payload.client_secret = GOOGLE_DRIVE_CLIENT_SECRET;
      }
    }
    if (token) {
      payload.token = this.normaliseToken(token);
      // `config_refresh_token` is an ephemeral rclone wizard answer. Without
      // it, rclone asks whether it should replace the token we just supplied
      // and can enter a second OAuth flow instead of finishing the backend.
      payload.config_refresh_token = 'false';
      if (type === 'onedrive') this.addOnedriveTokenUrl(payload);
    }

    const setup = await this.rclone.configCreate(remote, type, payload);
    const question = this.startSetup(
      remote,
      type,
      'create',
      owner,
      payload,
      true,
      setup,
    );
    if (question) {
      return question;
    }
    return this.completedSetup(remote, type);
  }

  async update(
    name: string,
    parameters: Record<string, string>,
    token: string | undefined,
    owner: string,
  ): Promise<RemoteSetupResult> {
    const remote = sanitizeRemoteName(name);
    const config = await this.rclone.configGet(remote);
    if (!config || Object.keys(config).length === 0) {
      throw notFound(`El remoto "${remote}" no existe`);
    }

    // A masked value means "leave this secret alone".
    const payload: Record<string, string> = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (SECRET_KEYS.test(key) && value === maskSecret('x')) continue;
      payload[key] = value;
    }
    if (token) {
      payload.token = this.normaliseToken(token);
      payload.config_refresh_token = 'false';
    } else if (config.token) {
      payload.config_refresh_token = 'false';
    }
    if (config.type === 'onedrive' && (token || config.token)) {
      this.addOnedriveTokenUrl(payload, config);
    }

    const setup = await this.rclone.configUpdate(remote, payload);
    const question = this.startSetup(
      remote,
      config.type ?? 'unknown',
      'update',
      owner,
      payload,
      false,
      setup,
    );
    if (question) {
      return question;
    }
    return this.completedSetup(remote, config.type ?? 'unknown');
  }

  async continueSetup(
    name: string,
    setupId: string,
    owner: string,
    state: string,
    answer: string,
  ): Promise<RemoteSetupResult> {
    const remote = sanitizeRemoteName(name);
    const session = this.requireSetup(setupId, remote, owner);
    const setup = await this.rclone.configContinue(
      session.operation,
      remote,
      session.type,
      state,
      answer,
      session.parameters,
    );
    const question = this.setupQuestion(remote, setupId, setup);
    if (question) {
      session.expiresAt = Date.now() + SETUP_SESSION_TTL_MS;
      return question;
    }
    this.setupSessions.delete(setupId);
    const config = await this.rclone.configGet(remote);
    return this.completedSetup(remote, config.type ?? 'unknown');
  }

  async cancelSetup(name: string, setupId: string, owner: string): Promise<boolean> {
    const remote = sanitizeRemoteName(name);
    const session = this.requireSetup(setupId, remote, owner);
    this.setupSessions.delete(setupId);
    if (!session.created) return false;
    await this.rclone.configDelete(remote);
    this.invalidate(remote);
    return true;
  }

  async remove(name: string): Promise<void> {
    const remote = sanitizeRemoteName(name);
    const existing = await this.rclone.listRemotes();
    if (!existing.includes(remote)) throw notFound(`El remoto "${remote}" no existe`);
    await this.rclone.configDelete(remote);
    this.invalidate(remote);
  }

  /** Accept either the raw JSON from `rclone authorize` or a bare access token. */
  private normaliseToken(token: string): string {
    const trimmed = token.trim();
    if (!trimmed) throw badRequest('El token está vacío');
    if (trimmed.startsWith('{')) {
      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch {
        throw badRequest('El token no es un JSON válido');
      }
    }
    return JSON.stringify({ access_token: trimmed, token_type: 'Bearer' });
  }

  /** Provider catalogue for the dynamic "add remote" form. */
  async providers(): Promise<ProviderInfo[]> {
    if (this.providersCache && Date.now() - this.providersCache.at < 600_000) {
      return this.providersCache.value;
    }

    const { providers } = await this.rclone.providers();
    const value: ProviderInfo[] = providers.map((provider) => ({
      name: provider.Name,
      description: provider.Description,
      oauth: OAUTH_SET.has(provider.Name),
      options: (provider.Options ?? [])
        // Hide === 1 marks options rclone itself never prompts for.
        .filter((option) => option.Hide !== 1)
        .map((option) => ({
          name: option.Name,
          help: option.Help ?? '',
          ...(option.Provider ? { provider: option.Provider } : {}),
          default: option.Default,
          examples: option.Examples?.map((example) => ({
            value: example.Value,
            help: example.Help,
            ...(example.Provider ? { provider: example.Provider } : {}),
          })),
          required: Boolean(option.Required),
          isPassword: Boolean(option.IsPassword),
          advanced: Boolean(option.Advanced),
          type: option.Type ?? 'string',
        })),
    }));

    this.providersCache = { at: Date.now(), value };
    return value;
  }

  /** Render the current configuration as an rclone.conf file. */
  async exportConfig(): Promise<string> {
    const dump = await this.rclone.configDump();
    return Object.entries(dump)
      .map(([name, config]) => {
        const body = Object.entries(config)
          .map(([key, value]) => `${key} = ${value}`)
          .join('\n');
        return `[${name}]\n${body}\n`;
      })
      .join('\n');
  }

  /** Import an rclone.conf, creating every section through `config/create`. */
  async importConfig(content: string): Promise<number> {
    const sections = this.parseIni(content);
    if (sections.length === 0) throw badRequest('El archivo no contiene ninguna sección');

    const existing = new Set(await this.rclone.listRemotes());
    let imported = 0;

    for (const section of sections) {
      const { type, ...parameters } = section.values;
      if (!type) continue;
      if (existing.has(section.name)) {
        await this.rclone.configUpdate(
          section.name,
          { type, ...parameters },
          { secretsAlreadyObscured: true },
        );
      } else {
        await this.rclone.configCreate(section.name, type, parameters, {
          secretsAlreadyObscured: true,
        });
      }
      imported += 1;
    }

    this.invalidate();
    return imported;
  }

  private parseIni(content: string): { name: string; values: Record<string, string> }[] {
    const sections: { name: string; values: Record<string, string> }[] = [];
    let current: { name: string; values: Record<string, string> } | null = null;

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;

      const header = /^\[(.+)]$/.exec(line);
      if (header?.[1]) {
        current = { name: sanitizeRemoteName(header[1]), values: {} };
        sections.push(current);
        continue;
      }

      const separator = line.indexOf('=');
      if (separator === -1 || !current) continue;
      current.values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }

    return sections;
  }
}
