import type { FastifyInstance } from "fastify";
import type { Run } from "@cloudbridge/shared";
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
    dryRunReport: null,
  };
}

describe("TransferService", () => {
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
});
