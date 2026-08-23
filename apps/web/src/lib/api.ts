import type {
  AppSettings,
  CompareResult,
  CronPreview,
  FsListing,
  Job,
  LogEntry,
  Paginated,
  ProviderInfo,
  RcloneHealth,
  RemoteDetail,
  RemoteSummary,
  Run,
  SessionUser,
  SizeResult,
} from '@cloudbridge/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new ApiError(0, 'network_error', 'No se pudo contactar con el servidor', cause);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const body = payload as { error?: string; message?: string; details?: unknown } | null;
    throw new ApiError(
      response.status,
      body?.error ?? 'error',
      body?.message ?? `La petición falló (${response.status})`,
      body?.details,
    );
  }
  return payload as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });

const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
};

export interface HealthResponse {
  status: string;
  version: string;
  rclone: RcloneHealth;
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  // ---------------------------------------------------------------- auth ---
  login: (username: string, password: string) =>
    post<{ user: SessionUser }>('/api/auth/login', { username, password }),
  logout: () => post<void>('/api/auth/logout'),
  me: () => request<{ user: SessionUser }>('/api/auth/me'),
  users: {
    list: () => request<SessionUser[]>('/api/users'),
    create: (input: { username: string; password: string; role: 'admin' | 'user' }) =>
      post<SessionUser>('/api/users', input),
    changePassword: (id: string, body: { currentPassword?: string; newPassword: string }) =>
      post<void>(`/api/users/${encodeURIComponent(id)}/password`, body),
    remove: (id: string) => del<void>(`/api/users/${encodeURIComponent(id)}`),
  },

  // ------------------------------------------------------------- remotes ---
  remotes: {
    list: () => request<RemoteSummary[]>('/api/remotes'),
    get: (name: string) => request<RemoteDetail>(`/api/remotes/${encodeURIComponent(name)}`),
    create: (input: {
      name: string;
      type: string;
      parameters: Record<string, string>;
      token?: string;
    }) => post<RemoteSummary>('/api/remotes', input),
    update: (name: string, input: { parameters: Record<string, string>; token?: string }) =>
      put<RemoteSummary>(`/api/remotes/${encodeURIComponent(name)}`, input),
    remove: (name: string) => del<void>(`/api/remotes/${encodeURIComponent(name)}`),
    test: (name: string) =>
      post<{ online: boolean; error: string | null }>(
        `/api/remotes/${encodeURIComponent(name)}/test`,
      ),
    about: (name: string) =>
      request<RemoteSummary>(`/api/remotes/${encodeURIComponent(name)}/about`),
    providers: () => request<ProviderInfo[]>('/api/remotes/providers'),
    exportConfig: () => request<{ config: string }>('/api/remotes/config/export'),
    importConfig: (config: string) => post<{ imported: number }>('/api/remotes/config/import', { config }),
  },

  // ------------------------------------------------------------------ fs ---
  fs: {
    list: (remote: string, path: string, recurse = false) =>
      request<FsListing>(`/api/fs/list${qs({ remote, path, recurse })}`),
    mkdir: (remote: string, path: string) => post<void>('/api/fs/mkdir', { remote, path }),
    remove: (remote: string, paths: string[]) => post<void>('/api/fs/delete', { remote, paths }),
    rename: (remote: string, from: string, to: string, isDir: boolean) =>
      post<void>('/api/fs/rename', { remote, from, to, isDir }),
    size: (remote: string, path: string) =>
      request<SizeResult>(`/api/fs/size${qs({ remote, path })}`),
    transfer: (body: unknown) => post<Run>('/api/fs/transfer', body),
    compare: (body: unknown) => post<CompareResult>('/api/fs/compare', body),
    downloadUrl: (remote: string, path: string) => `/api/fs/download${qs({ remote, path })}`,
  },

  // ----------------------------------------------------------- transfers ---
  transfers: {
    list: () => request<Run[]>('/api/transfers'),
    stop: (id: string) => post<Run>(`/api/transfers/${encodeURIComponent(id)}/stop`),
    pause: (id: string) => post<Run>(`/api/transfers/${encodeURIComponent(id)}/pause`),
    resume: (id: string) => post<Run>(`/api/transfers/${encodeURIComponent(id)}/resume`),
  },

  // ---------------------------------------------------------------- jobs ---
  jobs: {
    list: () => request<Job[]>('/api/jobs'),
    get: (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}`),
    create: (input: unknown) => post<Job>('/api/jobs', input),
    update: (id: string, input: unknown) => put<Job>(`/api/jobs/${encodeURIComponent(id)}`, input),
    remove: (id: string) => del<void>(`/api/jobs/${encodeURIComponent(id)}`),
    run: (id: string, body?: { dryRun?: boolean; confirm?: string }) =>
      post<Run>(`/api/jobs/${encodeURIComponent(id)}/run`, body ?? {}),
    duplicate: (id: string) => post<Job>(`/api/jobs/${encodeURIComponent(id)}/duplicate`),
    history: (id: string) => request<Run[]>(`/api/jobs/${encodeURIComponent(id)}/history`),
    cronPreview: (cron: string, timezone: string) =>
      post<CronPreview>('/api/jobs/cron-preview', { cron, timezone }),
  },

  // ---------------------------------------------------------------- logs ---
  logs: {
    list: (params: Record<string, string | number | undefined>) =>
      request<Paginated<LogEntry>>(`/api/logs${qs(params)}`),
    exportUrl: (params: Record<string, string | number | undefined>) =>
      `/api/logs/export${qs(params)}`,
  },

  // ------------------------------------------------------------ settings ---
  settings: {
    get: () => request<AppSettings>('/api/settings'),
    update: (input: unknown) => put<AppSettings>('/api/settings', input),
    testRclone: (input?: { url: string; user: string; password?: string }) =>
      post<RcloneHealth>('/api/settings/test-rclone', input ?? {}),
    timezones: () => request<string[]>('/api/settings/timezones'),
  },
};
