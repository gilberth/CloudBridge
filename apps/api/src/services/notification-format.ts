import type { NotificationEvent } from "./notification-types.js";

const STATUS = { success: "Completada", error: "Fallida" } as const;

export function formatDefaultMessage(event: NotificationEvent): string {
  const lines = [
    `${event.outcome === "success" ? "✅" : "❌"} ${STATUS[event.outcome]}: ${event.job}`,
    `Operación: ${event.mode}`,
    `Origen: ${event.source || "—"}`,
    `Destino: ${event.destinations.join(", ") || "—"}`,
    `Archivos: ${event.files} · Tamaño: ${event.bytesHuman} · Duración: ${event.duration || "—"}`,
  ];
  if (event.error) lines.push(`Error: ${event.error}`);
  if (event.failedFiles.length > 0) {
    lines.push("Archivos con error:");
    for (const item of event.failedFiles.slice(0, 10)) {
      lines.push(`• ${item.name}: ${item.error}`);
    }
    if (event.failedFiles.length > 10) {
      lines.push(`… y ${event.failedFiles.length - 10} archivo(s) más`);
    }
  }
  return lines.join("\n");
}

export function renderJsonTemplate(template: string, event: NotificationEvent): string {
  const variables: Record<string, string> = {
    job: event.job,
    status: event.outcome,
    mode: event.mode,
    source: event.source,
    destinations: event.destinations.join(", "),
    files: String(event.files),
    bytes: String(event.bytes),
    bytesHuman: event.bytesHuman,
    duration: event.duration,
    error: event.error ?? "",
    runId: event.runId,
    failedFiles: event.failedFiles.map((item) => item.name).join(", "),
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) =>
    JSON.stringify(variables[key] ?? "").slice(1, -1),
  );
}

export function truncateMessage(message: string, limit: number): string {
  if (message.length <= limit) return message;
  return `${message.slice(0, Math.max(0, limit - 1))}…`;
}
