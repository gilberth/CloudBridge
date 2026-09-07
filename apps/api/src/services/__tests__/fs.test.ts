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
});
