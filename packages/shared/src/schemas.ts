import { z } from "zod";

/** Literal tuples so the inferred types stay narrow (LogLevel, JobMode). */
const logLevelEnum = z.enum(["debug", "info", "warn", "error"]);
const jobModeEnum = z.enum(["copy", "sync", "move", "bisync"]);

const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .regex(/^https?:\/\//i, {
    message: "La URL debe usar HTTP o HTTPS",
  });

const notificationBaseShape = {
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, "ID de canal inválido"),
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  notifyOnSuccess: z.boolean().default(true),
  notifyOnFailure: z.boolean().default(true),
};

export const notificationChannelInputSchema = z.discriminatedUnion("provider", [
  z.object({
    ...notificationBaseShape,
    provider: z.literal("telegram"),
    config: z.object({
      token: z.string().trim().min(1).max(512).optional(),
      chatId: z.string().trim().min(1).max(128),
      messageThreadId: z.string().trim().min(1).max(128).nullable().optional(),
    }),
  }),
  z.object({
    ...notificationBaseShape,
    provider: z.literal("discord"),
    config: z.object({
      webhookUrl: httpUrlSchema.optional(),
      username: z.string().trim().min(1).max(80).nullable().optional(),
    }),
  }),
  z.object({
    ...notificationBaseShape,
    provider: z.literal("ntfy"),
    config: z.object({
      serverUrl: httpUrlSchema,
      topic: z
        .string()
        .trim()
        .min(1)
        .max(256)
        .regex(/^[A-Za-z0-9_-]+$/, "Tópico inválido"),
      token: z.string().trim().min(1).max(2048).optional(),
      priority: z.number().int().min(1).max(5).default(3),
    }),
  }),
  z.object({
    ...notificationBaseShape,
    provider: z.literal("webhook"),
    config: z.object({
      url: httpUrlSchema.optional(),
      template: z.string().max(8192).nullable().optional(),
      headers: z.record(z.string().max(2048)).optional(),
    }),
  }),
]);

/**
 * A remote name as accepted by rclone: no colon, no slash, no leading dash.
 * The API additionally checks the name against `config/listremotes`.
 */
export const remoteNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.\- ]+$/, "Nombre de remoto inválido");

/**
 * A path inside a remote. Traversal is rejected here and again in the API's
 * path sanitiser, which is the single place allowed to build `remote:path`.
 */
export const remotePathStringSchema = z
  .string()
  .max(4096)
  .refine((value) => !value.split("/").includes(".."), {
    message: 'La ruta no puede contener ".."',
  })
  .refine((value) => !value.includes("\0"), { message: "Ruta inválida" });

export const remotePathSchema = z.object({
  remote: remoteNameSchema,
  path: remotePathStringSchema.default(""),
});

export const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(512),
});

export const createUserSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(8).max(512),
  role: z.enum(["admin", "user"]).default("user"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(512).optional(),
  newPassword: z.string().min(8).max(512),
});

export const createRemoteSchema = z.object({
  name: remoteNameSchema,
  type: z.string().min(1).max(64),
  parameters: z.record(z.string()).default({}),
  /** Token JSON pasted from `rclone authorize "<type>"`. */
  token: z.string().max(8192).optional(),
});

export const updateRemoteSchema = z.object({
  parameters: z.record(z.string()).default({}),
  token: z.string().max(8192).optional(),
});

export const continueRemoteSetupSchema = z.object({
  setupId: z.string().uuid(),
  state: z.string().min(1).max(8192),
  answer: z.string().max(8192),
});

export const cancelRemoteSetupSchema = z.object({
  setupId: z.string().uuid(),
});

export const fsListQuerySchema = z.object({
  remote: remoteNameSchema,
  path: remotePathStringSchema.default(""),
  // `z.coerce.boolean()` reads `"false"` as a non-empty string, so it
  // coerces to `true` — the exact opposite of what a `?recurse=false` query
  // param means. Every Explorer listing sends `recurse=false` explicitly
  // (the frontend's `qs()` helper doesn't omit `false`), so this silently
  // made every listing recursive.
  recurse: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
});

export const fsMkdirSchema = remotePathSchema;

/** Deleting needs to know what each entry is: files and directories use
 *  different rclone endpoints (`operations/deletefile` vs `operations/purge`). */
export const fsDeleteSchema = z.object({
  remote: remoteNameSchema,
  entries: z
    .array(z.object({ path: remotePathStringSchema, isDir: z.boolean().default(false) }))
    .min(1)
    .max(5000),
});

export const fsRenameSchema = z.object({
  remote: remoteNameSchema,
  from: remotePathStringSchema,
  to: remotePathStringSchema,
  isDir: z.boolean().default(false),
});

export const transferFiltersSchema = z.object({
  include: z.array(z.string().max(512)).max(200).default([]),
  exclude: z.array(z.string().max(512)).max(200).default([]),
});

export const transferOptionsSchema = z.object({
  dryRun: z.boolean().default(false),
  checkFirst: z.boolean().default(false),
  trackRenames: z.boolean().default(false),
  createEmptySrcDirs: z.boolean().default(true),
  ignoreErrors: z.boolean().default(false),
  transfers: z.number().int().min(1).max(64).nullable().default(null),
  checkers: z.number().int().min(1).max(256).nullable().default(null),
  bwlimit: z
    .string()
    .regex(/^\d+(\.\d+)?[KMGTP]?(:\d+(\.\d+)?[KMGTP]?)?$/i, "Formato de límite inválido")
    .nullable()
    .default(null),
  deleteOnDst: z.boolean().default(false),
  filters: transferFiltersSchema.default({ include: [], exclude: [] }),
});

/** Ad-hoc Explorer transfer (drag & drop or the centre buttons). */
export const fsTransferSchema = z.object({
  mode: z.enum(["copy", "move", "sync"]),
  source: remotePathSchema,
  /** Names selected in the source panel; empty means "the whole directory". */
  items: z
    .array(z.object({ name: z.string().min(1).max(1024), isDir: z.boolean() }))
    .max(5000)
    .default([]),
  destination: remotePathSchema,
  options: transferOptionsSchema.partial().default({}),
  /** Must equal the destination path when `options.deleteOnDst` is set. */
  confirm: z.string().max(4096).optional(),
});

export const fsCompareSchema = z.object({
  source: remotePathSchema,
  destination: remotePathSchema,
  /** Comparisons audit the complete tree unless an API caller opts out explicitly. */
  recurse: z.boolean().default(true),
  /** Use `operations/check` (hashes, optionally downloading) instead of size+mtime. */
  deep: z.boolean().default(false),
  download: z.boolean().default(false),
});

export const jobDestinationSchema = remotePathSchema;

export const jobInputSchema = z.object({
  name: z.string().min(1).max(200),
  mode: jobModeEnum,
  source: remotePathSchema,
  destinations: z.array(jobDestinationSchema).min(1).max(20),
  options: transferOptionsSchema,
  cron: z.string().max(120).nullable().default(null),
  timezone: z.string().min(1).max(64).default("UTC"),
  enabled: z.boolean().default(true),
  webhookUrl: z.string().url().max(2048).nullable().default(null),
  notifyOnSuccess: z.boolean().default(false),
  notifyOnFailure: z.boolean().default(true),
  /** Required (equal to the job name) whenever `options.deleteOnDst` is true. */
  confirm: z.string().max(200).optional(),
});

export const jobRunSchema = z.object({
  dryRun: z.boolean().optional(),
  confirm: z.string().max(200).optional(),
});

export const logQuerySchema = z.object({
  level: logLevelEnum.optional(),
  jobId: z.string().max(64).optional(),
  runId: z.string().max(64).optional(),
  search: z.string().max(512).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const settingsUpdateSchema = z.object({
  rclone: z
    .object({
      url: z.string().url().max(512),
      user: z.string().max(128),
      password: z.string().max(512).optional(),
    })
    .optional(),
  defaults: z
    .object({
      transfers: z.number().int().min(1).max(64),
      checkers: z.number().int().min(1).max(256),
      bwlimit: z.string().max(64).nullable(),
      logLevel: logLevelEnum,
    })
    .optional(),
  historyRetentionDays: z.number().int().min(1).max(3650).optional(),
  notifications: z.array(notificationChannelInputSchema).max(32).optional(),
  webhookUrl: z.string().url().max(2048).nullable().optional(),
  webhookTemplate: z.string().max(8192).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal inválido")
    .optional(),
});

export const cronPreviewSchema = z.object({
  cron: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default("UTC"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateRemoteInput = z.infer<typeof createRemoteSchema>;
export type FsTransferInput = z.infer<typeof fsTransferSchema>;
export type FsCompareInput = z.infer<typeof fsCompareSchema>;
export type JobInput = z.infer<typeof jobInputSchema>;
export type LogQueryInput = z.infer<typeof logQuerySchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type NotificationChannelInput = z.infer<typeof notificationChannelInputSchema>;
