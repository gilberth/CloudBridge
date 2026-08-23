/** Shared primitives used across the CloudBridge API and web client. */

export type JobMode = 'copy' | 'sync' | 'move' | 'bisync';

export const JOB_MODES: JobMode[] = ['copy', 'sync', 'move', 'bisync'];

/**
 * Lifecycle of a single execution ("run"). A run is either an ad-hoc Explorer
 * operation (jobId === null) or one execution of a saved job.
 */
export type RunStatus =
  | 'running'
  | 'paused'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'interrupted';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
