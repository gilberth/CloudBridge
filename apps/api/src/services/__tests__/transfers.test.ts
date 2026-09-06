import type { FastifyInstance } from "fastify";
import type { CompareResult, FsCompareInput, Run } from "@cloudbridge/shared";
import { describe, expect, it, vi } from "vitest";
import { TransferService } from "../transfers.js";

function runningRun(): Run {
  return {
    id: "run-1",
    jobId: null,
    jobName: null,
    label: "copy drive: → ulima_drive:",
    mode: "copy",
    status: "running",
    dryRun: false,
    group: "run:run-1",
    rcloneJobIds: [],
    source: { remote: "drive", path: "" },
    destinations: [{ remote: "ulima_drive", path: "" }],
    startedAt: "2026-08-23T00:00:00.000Z",
    finishedAt: null,
    durationMs: null,
    files: 0,
    bytes: 0,
    errors: 0,
    errorMessage: null,
    failedFiles: [],
    retryOfRunId: null,
    dryRunReport: null,
    comparison: null,
  };
}

describe("TransferService", () => {
  it("persiste y completa una comparación profunda", async () => {
    const run = { ...runningRun(), mode: "compare" as const };
    const input: FsCompareInput = {
      source: { remote: "drive", path: "origen" },
      destination: { remote: "ulima_drive", path: "destino" },
      deep: true,
      recurse: false,
      download: false,
    };
    const result: CompareResult = {
      source: input.source,
      destination: input.destination,
      deep: true,
      rows: [],
      counts: { onlySrc: 0, onlyDst: 0, differ: 0, identical: 0 },
    };
    const update = vi.fn();
    const app = {
      fs: { compare: vi.fn().mockResolvedValue(result) },
      runs: { create: vi.fn().mockReturnValue(run), update },
      logs: { write: vi.fn() },
    } as unknown as FastifyInstance;

    const started = await new TransferService(app).compare(input);

    expect(started.mode).toBe("compare");
    expect(app.runs.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "compare", source: input.source }),
    );
    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        run.id,
        expect.objectContaining({ status: "success", files: 0, errors: 0 }),
      ),
    );
  });

  it("copies selected Drive folders without forcing server-side across configs", async () => {
    const syncCopy = vi.fn().mockResolvedValue(42);
    const run = runningRun();
    const app = {
      rclone: { syncCopy },
      remotes: {
        types: vi.fn().mockResolvedValue({ drive: "drive", ulima_drive: "drive" }),
      },
      settings: {
        transferDefaults: vi
          .fn()
          .mockReturnValue({ transfers: 4, checkers: 8, bwlimit: null }),
      },
      runs: {
        create: vi.fn().mockReturnValue(run),
        attachJobIds: vi.fn(),
        update: vi.fn(),
      },
      bandwidth: {
        acquire: vi.fn().mockResolvedValue(undefined),
        release: vi.fn().mockResolvedValue(undefined),
      },
      logs: { write: vi.fn() },
    } as unknown as FastifyInstance;

    const result = await new TransferService(app).start({
      mode: "copy",
      source: { remote: "drive", path: "" },
      destinations: [{ remote: "ulima_drive", path: "" }],
      items: [{ name: "factura", isDir: true }],
      options: {},
    });

    expect(result.rcloneJobIds).toEqual([42]);
    expect(syncCopy).toHaveBeenCalledWith(
      "drive:",
      "ulima_drive:",
      expect.objectContaining({
        filter: { IncludeRule: ["/factura/**"] },
        createEmptySrcDirs: true,
      }),
    );
  });

  it("notifica también cuando termina una transferencia manual", async () => {
    let stored = { ...runningRun(), rcloneJobIds: [42] };
    const notify = vi.fn().mockResolvedValue(undefined);
    const app = {
      rclone: {
        jobStatus: vi.fn().mockResolvedValue({
          finished: true,
          success: true,
          error: "",
        }),
        stats: vi.fn().mockResolvedValue({ transfers: 1, bytes: 1024, errors: 0 }),
        transferred: vi.fn().mockResolvedValue([]),
      },
      runs: {
        active: vi.fn().mockReturnValue([stored]),
        update: vi.fn((_id: string, patch: Partial<Run>) => {
          stored = { ...stored, ...patch };
        }),
        get: vi.fn(() => stored),
      },
      bandwidth: { release: vi.fn().mockResolvedValue(undefined) },
      logs: { write: vi.fn() },
      stats: { emitRunFinished: vi.fn() },
      notifications: { send: notify },
    } as unknown as FastifyInstance;

    await new TransferService(app).reconcile();

    expect(notify).toHaveBeenCalledWith(stored, "success", null, []);
  });

  it("persiste los archivos fallidos que informa rclone", async () => {
    const run = { ...runningRun(), rcloneJobIds: [42] };
    const recordFailures = vi.fn();
    const app = {
      rclone: {
        jobStatus: vi
          .fn()
          .mockResolvedValue({ finished: true, success: false, error: "falló" }),
        stats: vi.fn().mockResolvedValue({ transfers: 1, bytes: 0, errors: 1 }),
        transferred: vi.fn().mockResolvedValue([
          {
            name: "carpeta/archivo.txt",
            error: "acceso denegado",
            bytes: 10,
            size: 20,
          },
        ]),
      },
      runs: {
        active: vi.fn().mockReturnValue([run]),
        update: vi.fn(),
        get: vi.fn(() => run),
        recordFailures,
      },
      bandwidth: { release: vi.fn().mockResolvedValue(undefined) },
      logs: { write: vi.fn() },
      stats: { emitRunFinished: vi.fn() },
      notifications: { send: vi.fn() },
    } as unknown as FastifyInstance;

    await new TransferService(app).reconcile();

    expect(recordFailures).toHaveBeenCalledWith(run.id, [
      { name: "carpeta/archivo.txt", error: "acceso denegado", bytes: 10, size: 20 },
    ]);
  });

  it("reintenta los archivos fallidos como copia no destructiva", async () => {
    const original = {
      ...runningRun(),
      mode: "move" as const,
      failedFiles: [
        {
          id: "failure-1",
          name: "carpeta/archivo.txt",
          error: "falló",
          bytes: 0,
          size: 20,
        },
      ],
    };
    const retry = { ...runningRun(), id: "retry-1", group: "run:retry-1" };
    const app = {
      rclone: {
        callAsync: vi.fn().mockResolvedValue(50),
        call: vi.fn().mockResolvedValue({ finished: true, success: true }),
        jobStatus: vi.fn().mockResolvedValue({ finished: true, success: true }),
      },
      remotes: {
        types: vi.fn().mockResolvedValue({ drive: "drive", ulima_drive: "drive" }),
      },
      settings: {
        transferDefaults: vi
          .fn()
          .mockReturnValue({ transfers: 4, checkers: 8, bwlimit: null }),
      },
      runs: {
        get: vi.fn(() => original),
        params: vi.fn(() => ({ options: { filters: { include: [], exclude: [] } } })),
        create: vi.fn().mockReturnValue(retry),
        attachJobIds: vi.fn(),
        update: vi.fn(),
      },
      bandwidth: {
        acquire: vi.fn().mockResolvedValue(undefined),
        release: vi.fn().mockResolvedValue(undefined),
      },
      logs: { write: vi.fn() },
    } as unknown as FastifyInstance;

    await new TransferService(app).retryFailures(original.id, ["failure-1"]);

    expect(app.rclone.callAsync).toHaveBeenCalledWith(
      "operations/copyfile",
      expect.objectContaining({ srcRemote: "carpeta/archivo.txt" }),
      expect.anything(),
    );
    expect(app.runs.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "copy", retryOfRunId: original.id }),
    );
  });
});
