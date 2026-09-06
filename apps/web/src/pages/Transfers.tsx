import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  Ban,
  Pause,
  Play,
  Radio,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { CompareCategory, Run, RunStatus } from "@cloudbridge/shared";
import { ApiError, api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStats } from "@/hooks/useStats";
import { cn, formatDateTime, humanBytes, humanDuration, humanSpeed } from "@/lib/utils";

const STATUS_META: Record<
  RunStatus,
  { label: string; variant: "success" | "danger" | "warning" | "info" | "outline" }
> = {
  running: { label: "en curso", variant: "info" },
  paused: { label: "pausada", variant: "warning" },
  success: { label: "completada", variant: "success" },
  error: { label: "error", variant: "danger" },
  cancelled: { label: "cancelada", variant: "outline" },
  interrupted: { label: "interrumpida", variant: "warning" },
};

export default function TransfersPage() {
  const queryClient = useQueryClient();
  const { global, runs: liveRuns, connected } = useStats();

  const { data, isPending } = useQuery({
    queryKey: ["transfers"],
    queryFn: api.transfers.list,
    // The websocket drives live updates; this is the fallback and the history.
    refetchInterval: connected ? 15_000 : 3000,
  });

  const active = useMemo(
    () =>
      (data ?? []).filter((run) => run.status === "running" || run.status === "paused"),
    [data],
  );
  const finished = useMemo(
    () =>
      (data ?? []).filter((run) => run.status !== "running" && run.status !== "paused"),
    [data],
  );

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "stop" | "pause" | "resume" }) =>
      api.transfers[action](id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["transfers"] }),
    onError: (error) =>
      toast.error("La acción falló", {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const retryFailures = useMutation({
    mutationFn: ({ id, failureIds }: { id: string; failureIds?: string[] }) =>
      api.transfers.retryFailures(id, failureIds),
    onSuccess: () => {
      toast.success("Reintento iniciado como copia segura");
      void queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: (error) =>
      toast.error("No se pudo iniciar el reintento", {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const transferring = liveRuns.flatMap((run) =>
    run.stats.transferring.map((item) => ({ run, item })),
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Transfers"
        description={
          connected ? undefined : "Sin conexión en vivo; refrescando cada 3 s."
        }
        actions={
          <div className="flex items-center gap-3 text-[12px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Radio
                className={cn(
                  "size-3",
                  connected ? "text-emerald-500" : "text-muted-foreground",
                )}
              />
              {connected ? "en vivo" : "reconectando"}
            </span>
            <Stat label="Velocidad" value={humanSpeed(global.speed)} />
            <Stat
              label="En cola"
              value={`${Math.max(global.totalTransfers - global.transfers, 0)}`}
            />
            <Stat label="Transcurrido" value={humanDuration(global.elapsedTime)} />
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section>
          <SectionTitle>
            Activas {active.length > 0 && <Badge variant="info">{active.length}</Badge>}
          </SectionTitle>

          {isPending && <TableSkeleton rows={3} columns={5} />}

          {!isPending && active.length === 0 && (
            <EmptyState
              icon={ArrowRight}
              title="Nada en curso"
              description="Las transferencias que lances desde el Explorer o desde un job aparecerán aquí."
              className="py-10"
            />
          )}

          {active.map((run) => {
            const live = liveRuns.find((candidate) => candidate.id === run.id);
            const stats = live?.stats;
            const percentage =
              stats && stats.totalBytes > 0 ? (stats.bytes / stats.totalBytes) * 100 : 0;
            const isComparison = run.mode === "compare";

            return (
              <article key={run.id} className="border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_META[run.status].variant}>
                    {STATUS_META[run.status].label}
                  </Badge>
                  {run.dryRun && <Badge variant="outline">dry-run</Badge>}
                  <span className="mono min-w-0 flex-1 truncate text-[12px]">
                    {run.label}
                  </span>

                  {!isComparison && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {run.status === "running" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Pausar"
                              onClick={() => act.mutate({ id: run.id, action: "pause" })}
                            >
                              <Pause />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Pausar (para el job y lo relanza al reanudar)
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Reanudar"
                              onClick={() => act.mutate({ id: run.id, action: "resume" })}
                            >
                              <Play />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reanudar</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Cancelar"
                            className="text-destructive"
                            disabled={run.status !== "running"}
                            onClick={() => act.mutate({ id: run.id, action: "stop" })}
                          >
                            <Ban />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Cancelar</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>

                {isComparison ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Comparando archivos{run.source ? ` de ${run.source.remote}` : ""}…
                  </p>
                ) : (
                  <div className="mt-1.5 flex items-center gap-3">
                    <Progress value={percentage} className="flex-1" />
                    <span className="w-40 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {humanBytes(stats?.bytes ?? run.bytes)} /{" "}
                      {humanBytes(stats?.totalBytes ?? 0)} ·{" "}
                      {humanSpeed(stats?.speed ?? 0)}
                    </span>
                    <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {stats?.eta != null ? humanDuration(stats.eta) : "—"}
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {transferring.length > 0 && (
          <section>
            <SectionTitle>Archivos en vuelo</SectionTitle>
            <table className="w-full text-[12px]">
              <thead className="bg-surface text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-y border-border">
                  <th className="px-4 py-1.5 text-left font-medium">Archivo</th>
                  <th className="w-48 px-2 py-1.5 text-left font-medium">Progreso</th>
                  <th className="w-24 px-2 py-1.5 text-right font-medium">Velocidad</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">ETA</th>
                  <th className="w-36 px-4 py-1.5 text-right font-medium">Transferido</th>
                </tr>
              </thead>
              <tbody>
                {transferring.map(({ run, item }) => (
                  <tr
                    key={`${run.id}-${item.name}`}
                    className="border-b border-border/40"
                  >
                    <td className="mono max-w-0 truncate px-4 py-1">{item.name}</td>
                    <td className="px-2 py-1">
                      <Progress value={item.percentage} />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {humanSpeed(item.speed)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {item.eta != null ? humanDuration(item.eta) : "—"}
                    </td>
                    <td className="px-4 py-1 text-right tabular-nums text-muted-foreground">
                      {humanBytes(item.bytes)} / {humanBytes(item.size)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <SectionTitle>Recientes</SectionTitle>
          {finished.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
              Todavía no hay ejecuciones terminadas.
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="bg-surface text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-y border-border">
                  <th className="w-28 px-4 py-1.5 text-left font-medium">Estado</th>
                  <th className="px-2 py-1.5 text-left font-medium">Operación</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">Archivos</th>
                  <th className="w-24 px-2 py-1.5 text-right font-medium">Tamaño</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">Duración</th>
                  <th className="w-32 px-4 py-1.5 text-right font-medium">Inicio</th>
                </tr>
              </thead>
              <tbody>
                {finished.map((run) => (
                  <FinishedRow
                    key={run.id}
                    run={run}
                    onRetry={(failureIds) =>
                      retryFailures.mutate({ id: run.id, failureIds })
                    }
                    retrying={retryFailures.isPending}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function FinishedRow({
  run,
  onRetry,
  retrying,
}: {
  run: Run;
  onRetry: (failureIds?: string[]) => void;
  retrying: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isComparison = run.mode === "compare";
  const meta = STATUS_META[run.status];
  const Icon =
    run.status === "success"
      ? CircleCheck
      : run.status === "error"
        ? CircleX
        : TriangleAlert;

  return (
    <tr className="border-b border-border/40">
      <td className="px-4 py-1.5">
        <span
          className={cn(
            "flex items-center gap-1.5",
            run.status === "success"
              ? "text-emerald-600 dark:text-emerald-400"
              : run.status === "error"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {meta.label}
          {run.failedFiles.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => setDetailsOpen(true)}
            >
              {run.failedFiles.length} archivo{run.failedFiles.length === 1 ? "" : "s"}
            </Button>
          )}
          {isComparison && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => setDetailsOpen(true)}
            >
              Ver diferencias
            </Button>
          )}
        </span>
      </td>
      <td
        className="mono max-w-0 truncate px-2 py-1.5"
        title={run.errorMessage ?? run.label}
      >
        {run.label}
        {run.dryRun && (
          <span className="ml-1.5 text-[10px] uppercase text-primary">dry-run</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{run.files}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{humanBytes(run.bytes)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
        {run.durationMs != null ? humanDuration(run.durationMs / 1000) : "—"}
      </td>
      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
        {formatDateTime(run.startedAt)}
      </td>
      {isComparison ? (
        <ComparisonDetails run={run} open={detailsOpen} onOpenChange={setDetailsOpen} />
      ) : (
        <FailureDetails
          run={run}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onRetry={onRetry}
          retrying={retrying}
        />
      )}
    </tr>
  );
}

const CATEGORY_LABEL: Record<CompareCategory, string> = {
  onlySrc: "Solo en origen",
  onlyDst: "Solo en destino",
  differ: "Distinto",
  identical: "Igual",
};

function ComparisonDetails({
  run,
  open,
  onOpenChange,
}: {
  run: Run;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const result = run.comparison;
  const differences = result?.rows.filter((row) => row.category !== "identical") ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {result?.deep ? "Comparación profunda" : "Comparación"}
          </DialogTitle>
          <DialogDescription>
            {result
              ? `${differences.length} diferencia${differences.length === 1 ? "" : "s"} entre los remotos.`
              : (run.errorMessage ?? "La comparación aún no tiene resultados.")}
          </DialogDescription>
        </DialogHeader>
        {result && (
          <>
            <div className="grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
              {(Object.keys(result.counts) as CompareCategory[]).map((category) => (
                <div key={category} className="rounded-md border border-border px-3 py-2">
                  <p className="text-muted-foreground">{CATEGORY_LABEL[category]}</p>
                  <p className="mt-0.5 font-medium tabular-nums">
                    {result.counts[category]}
                  </p>
                </div>
              ))}
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border border-border">
              {differences.length === 0 ? (
                <p className="p-3 text-[12px] text-muted-foreground">
                  No se encontraron diferencias.
                </p>
              ) : (
                differences.map((row) => (
                  <div
                    key={`${row.category}:${row.name}`}
                    className="flex gap-3 border-b border-border/60 p-3 last:border-b-0"
                  >
                    <span className="w-28 shrink-0 text-[11px] text-muted-foreground">
                      {CATEGORY_LABEL[row.category]}
                    </span>
                    <p className="mono break-all text-[12px]">
                      {row.src?.path ?? row.dst?.path ?? row.name}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FailureDetails({
  run,
  open,
  onOpenChange,
  onRetry,
  retrying,
}: {
  run: Run;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: (failureIds?: string[]) => void;
  retrying: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Archivos con error</DialogTitle>
          <DialogDescription>
            {run.failedFiles.length} archivo{run.failedFiles.length === 1 ? "" : "s"} de
            esta ejecución. Los reintentos siempre usan copia, incluso si la operación
            original fue mover o sincronizar.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          {run.failedFiles.map((failure) => (
            <div
              key={failure.id}
              className="flex gap-3 border-b border-border/60 p-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="mono break-all text-[12px]">{failure.name}</p>
                <p className="mt-1 text-[11px] text-destructive">{failure.error}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={retrying}
                onClick={() => onRetry([failure.id])}
              >
                <RotateCcw /> Reintentar
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button disabled={retrying} onClick={() => onRetry()}>
            <RotateCcw /> Reintentar todos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </span>
  );
}
