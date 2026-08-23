/** Response shapes of the rclone rc endpoints CloudBridge consumes. */

export interface RcCoreVersion {
  version: string;
  decomposed: number[];
  isGit: boolean;
  isBeta: boolean;
  os: string;
  arch: string;
  goVersion: string;
  goTags?: string;
  linking?: string;
}

export interface RcTransferring {
  name: string;
  size: number;
  bytes: number;
  percentage: number;
  speed: number;
  speedAvg: number;
  eta?: number | null;
  group?: string;
  srcFs?: string;
  dstFs?: string;
}

export interface RcCoreStats {
  bytes: number;
  totalBytes: number;
  checks: number;
  totalChecks: number;
  deletes: number;
  elapsedTime: number;
  errors: number;
  eta?: number | null;
  fatalError: boolean;
  retryError: boolean;
  lastError?: string;
  renames: number;
  speed: number;
  transfers: number;
  totalTransfers: number;
  transferTime: number;
  transferring?: RcTransferring[];
  checking?: string[];
}

export interface RcTransferredItem {
  name: string;
  size: number;
  bytes: number;
  checked: boolean;
  error: string;
  jobid: number;
  group?: string;
  started_at: string;
  completed_at: string;
  srcFs?: string;
  dstFs?: string;
}

export interface RcListItem {
  Path: string;
  Name: string;
  Size: number;
  MimeType: string;
  ModTime: string;
  IsDir: boolean;
  Hashes?: Record<string, string>;
  ID?: string;
}

export interface RcListResult {
  list: RcListItem[];
}

export interface RcAbout {
  total?: number;
  used?: number;
  free?: number;
  trashed?: number;
  other?: number;
}

export interface RcSize {
  count: number;
  bytes: number;
}

export interface RcJobStatus {
  id: number;
  group: string;
  startTime: string;
  endTime: string;
  duration: number;
  finished: boolean;
  success: boolean;
  error: string;
  output?: unknown;
  progress?: unknown;
}

export interface RcAsyncResult {
  jobid: number;
  executeId?: string;
}

export interface RcCheckResult {
  success?: boolean;
  status?: string;
  hashType?: string;
  combined?: string[];
  missingOnSrc?: string[];
  missingOnDst?: string[];
  match?: string[];
  differ?: string[];
  error?: string[];
}

export interface RcProviderOption {
  Name: string;
  Help: string;
  Provider?: string;
  Default?: unknown;
  Value?: unknown;
  Examples?: { Value: string; Help: string; Provider?: string }[];
  Required?: boolean;
  IsPassword?: boolean;
  Advanced?: boolean;
  Hide?: number;
  Type?: string;
}

export interface RcProvider {
  Name: string;
  Description: string;
  Prefix: string;
  Options: RcProviderOption[];
}

export interface RcProviders {
  providers: RcProvider[];
}

export interface RcFsInfo {
  Name: string;
  Root: string;
  String: string;
  Precision: number;
  Hashes: string[];
  Features: Record<string, boolean>;
}

export interface RcJobList {
  jobids: number[];
  executeId?: string;
}
