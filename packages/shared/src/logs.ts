import type { LogLevel } from './common.js';

export interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  source: string;
  jobId: string | null;
  runId: string | null;
  message: string;
  meta: Record<string, unknown> | null;
}

export interface LogQuery {
  level?: LogLevel;
  jobId?: string;
  runId?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
