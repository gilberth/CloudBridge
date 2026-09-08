import type { RunMode, RunStatus } from "./common.js";
import type { CompareResult, RemotePath } from "./fs.js";

/** A single in-flight file, as reported by rclone `core/stats`. */
export interface TransferItem {
  name: string;
  size: number;
  bytes: number;
  percentage: number;
  /** Bytes per second, instantaneous. */
  speed: number;
  speedAvg: number;
  /** Seconds remaining, or null when rclone cannot estimate it. */
  eta: number | null;
  group?: string;
  srcFs?: string;
  dstFs?: string;
}

export interface StatsSnapshot {
  bytes: number;
  totalBytes: number;
  speed: number;
  transfers: number;
  totalTransfers: number;
  checks: number;
  totalChecks: number;
  /** Paths currently being validated by rclone. */
  checking: string[];
  errors: number;
  fatalError: boolean;
  retryError: boolean;
  elapsedTime: number;
  eta: number | null;
  transferring: TransferItem[];
}

export const EMPTY_STATS: StatsSnapshot = {
  bytes: 0,
  totalBytes: 0,
  speed: 0,
  transfers: 0,
  totalTransfers: 0,
  checks: 0,
  totalChecks: 0,
  checking: [],
  errors: 0,
  fatalError: false,
  retryError: false,
  elapsedTime: 0,
  eta: null,
  transferring: [],
};

/** A tracked execution: an ad-hoc Explorer operation or one run of a saved job. */
export interface Run {
  id: string;
  jobId: string | null;
  jobName: string | null;
  label: string;
  mode: RunMode;
  status: RunStatus;
  dryRun: boolean;
  /** rclone stats group, `run:<id>`. */
  group: string;
  rcloneJobIds: number[];
  source: RemotePath | null;
  destinations: RemotePath[];
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  files: number;
  bytes: number;
  errors: number;
  errorMessage: string | null;
  /** Files reported as failed by rclone, retained for inspection and retry. */
  failedFiles: FailedTransferFile[];
  /** Original execution when this run is a targeted retry. */
  retryOfRunId: string | null;
  /** Textual output of a `--dry-run` execution, when there is one. */
  dryRunReport: string | null;
  /** Result retained for an ad-hoc comparison; null for ordinary transfers. */
  comparison: CompareResult | null;
}

export interface FailedTransferFile {
  id: string;
  name: string;
  error: string;
  bytes: number;
  size: number;
}

export interface RunWithStats extends Run {
  stats: StatsSnapshot;
}

export interface RcloneHealth {
  online: boolean;
  version: string | null;
  error: string | null;
  checkedAt: string;
}

export type WsServerMessage =
  | {
      type: "stats";
      ts: string;
      health: RcloneHealth;
      global: StatsSnapshot;
      runs: RunWithStats[];
    }
  | { type: "run:finished"; ts: string; run: Run }
  | { type: "hello"; ts: string; interval: number };
