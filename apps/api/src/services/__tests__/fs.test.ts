import type { FastifyInstance } from "fastify";
import { fsCompareSchema } from "@cloudbridge/shared";
import { describe, expect, it, vi } from "vitest";
import { FsService } from "../fs.js";

describe("FsService.compare", () => {
  it("compara recursivamente por defecto e incluye archivos anidados", async () => {
    const list = vi.fn(
      async (fs: string, _remote: string, options: { recurse?: boolean }) => {
        if (!options.recurse || !fs.startsWith("origen:")) return [];
        return [
          {
            Path: "carpeta/archivo.txt",
            Name: "archivo.txt",
            Size: 12,
            MimeType: "text/plain",
            ModTime: "2026-08-23T00:00:00.000Z",
            IsDir: false,
          },
        ];
      },
    );
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue(["origen", "destino"]),
        list,
      },
    } as unknown as FastifyInstance;
    const input = fsCompareSchema.parse({
      source: { remote: "origen", path: "" },
      destination: { remote: "destino", path: "" },
    });

    const result = await new FsService(app).compare(input);

    expect(input.recurse).toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledWith(
      expect.any(String),
      "",
      expect.objectContaining({ recurse: true }),
    );
    expect(result.counts.onlySrc).toBe(1);
    expect(result.rows[0]?.src?.path).toBe("carpeta/archivo.txt");
  });

  it("usa directamente operations/check para una comparación profunda recursiva", async () => {
    const app = {
      rclone: {
        listRemotes: vi.fn().mockResolvedValue(["origen", "destino"]),
        list: vi
          .fn()
          .mockRejectedValue(new Error("el listado recursivo no debe ejecutarse")),
        check: vi.fn().mockResolvedValue({
          success: false,
          status: "4 differences found",
          hashType: "quickxor",
          combined: [
            "= igual.txt",
            "+ carpeta/falta.txt",
            "- extra.txt",
            "* distinto.txt",
            "! ilegible.txt",
          ],
          match: ["igual.txt"],
          missingOnDst: ["carpeta/falta.txt"],
          missingOnSrc: ["extra.txt"],
          differ: ["distinto.txt"],
          error: ["ilegible.txt"],
        }),
      },
    } as unknown as FastifyInstance;
    const input = fsCompareSchema.parse({
      source: { remote: "origen", path: "documentos" },
      destination: { remote: "destino", path: "respaldo" },
      deep: true,
    });

    const result = await new FsService(app).compare(input);

    expect(result.counts).toEqual({
      onlySrc: 1,
      onlyDst: 1,
      differ: 2,
      identical: 1,
    });
    expect(result.rows).toEqual([
      { name: "carpeta/falta.txt", isDir: false, category: "onlySrc" },
      { name: "distinto.txt", isDir: false, category: "differ", hashMismatch: true },
      { name: "extra.txt", isDir: false, category: "onlyDst" },
      { name: "igual.txt", isDir: false, category: "identical" },
      { name: "ilegible.txt", isDir: false, category: "differ" },
    ]);
  });
});
