import type { JobMode } from "@cloudbridge/shared";

export interface NotificationFailedFile {
  name: string;
  error: string;
  bytes: number;
  size: number;
}

export interface NotificationEvent {
  outcome: "success" | "error";
  job: string;
  mode: JobMode;
  source: string;
  destinations: string[];
  files: number;
  bytes: number;
  bytesHuman: string;
  duration: string;
  error: string | null;
  startedAt: string;
  finishedAt: string;
  runId: string;
  failedFiles: NotificationFailedFile[];
}

export interface NotificationAdapter {
  send(event: NotificationEvent): Promise<void>;
}
