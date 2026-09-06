import type { FastifyInstance } from "fastify";
import { z } from "zod";

const retryFailuresSchema = z.object({
  failureIds: z.array(z.string().uuid()).min(1).optional(),
});

export async function transferRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.get("/api/transfers", async () => app.runs.recent());

  app.post<{ Params: { id: string } }>("/api/transfers/:id/stop", async (request) =>
    app.transfers.stop(request.params.id),
  );

  app.post<{ Params: { id: string } }>("/api/transfers/:id/pause", async (request) =>
    app.transfers.pause(request.params.id),
  );

  app.post<{ Params: { id: string } }>("/api/transfers/:id/resume", async (request) =>
    app.transfers.resume(request.params.id),
  );

  app.post<{ Params: { id: string } }>(
    "/api/transfers/:id/retry-failures",
    async (request) => {
      const input = retryFailuresSchema.parse(request.body);
      return app.transfers.retryFailures(request.params.id, input.failureIds);
    },
  );
}
