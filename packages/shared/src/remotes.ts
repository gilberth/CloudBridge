export interface RemoteAbout {
  total?: number;
  used?: number;
  free?: number;
  trashed?: number;
  other?: number;
}

export interface RemoteSummary {
  name: string;
  type: string;
  /** `null` while the reachability probe has not run yet. */
  online: boolean | null;
  about: RemoteAbout | null;
  error?: string;
}

export interface RemoteDetail extends RemoteSummary {
  /** Config values with every secret replaced by a mask. */
  parameters: Record<string, string>;
}

/** One field of a provider's configuration form, derived from `config/providers`. */
export interface ProviderOption {
  name: string;
  help: string;
  provider?: string;
  default?: unknown;
  value?: unknown;
  examples?: { value: string; help: string; provider?: string }[];
  required: boolean;
  isPassword: boolean;
  advanced: boolean;
  type: string;
}

export interface ProviderInfo {
  name: string;
  description: string;
  options: ProviderOption[];
  /** True when the provider normally needs a browser-based OAuth dance. */
  oauth: boolean;
}

/** Providers that cannot be configured head-less without `rclone authorize`. */
export const OAUTH_PROVIDERS = [
  'drive',
  'onedrive',
  'dropbox',
  'box',
  'pcloud',
  'yandex',
  'premiumizeme',
  'putio',
  'sharefile',
  'hidrive',
  'jottacloud',
  'mailru',
  'zoho',
] as const;

/** Provider types that get a dedicated brand icon in the UI. */
export const BRANDED_PROVIDERS = [
  'drive',
  'onedrive',
  'dropbox',
  's3',
  'box',
  'mega',
  'b2',
  'pcloud',
  'sftp',
  'ftp',
  'webdav',
  'smb',
  'local',
  'googlecloudstorage',
  'azureblob',
] as const;
