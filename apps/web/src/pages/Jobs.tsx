import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  History,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Timer,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Job } from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Switch } from '@/components/ui/switch';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { JobWizard } from '@/components/jobs/JobWizard';
import { JobHistoryDialog } from '@/components/jobs/JobHistoryDialog';
import { cn, relativeTime } from '@/lib/utils';

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState<Job | null>(null);

  const { data, isPending } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  const toggle = useMutation({
    mutationFn: (job: Job) =>
      api.jobs.update(job.id, {
        name: job.name,
        mode: job.mode,
        source: job.source,
        destinations: job.destinations,
        options: job.options,
        cron: job.cron,
        timezone: job.timezone,
        enabled: !job.enabled,
        webhookUrl: job.webhookUrl,
        notifyOnSuccess: job.notifyOnSuccess,
        notifyOnFailure: job.notifyOnFailure,
        confirm: job.name,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    onError: (error) =>
      toast.error('No se pudo cambiar el estado', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const run = useMutation({
    mutationFn: (job: Job) => api.jobs.run(job.id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast.success('Job lanzado', { description: result.label });
    },
    onError: (error) =>
      toast.error('No se pudo lanzar el job', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const duplicate = useMutation({
    mutationFn: (job: Job) => api.jobs.duplicate(job.id),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success(`Job duplicado como "${job.name}" (desactivado)`);
    },
  });

  const remove = useMutation({
    mutationFn: (job: Job) => api.jobs.remove(job.id),
    onSuccess: (_result, job) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success(`Job "${job.name}" eliminado`);
      setDeleting(null);
    },
    onError: (error) =>
      toast.error('No se pudo eliminar', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Jobs"
        description={data ? `${data.length} jobs guardados` : undefined}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setWizardOpen(true);
            }}
          >
            <Plus />
            Nuevo job
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending && <TableSkeleton rows={6} columns={6} />}

        {data?.length === 0 && (
          <EmptyState
            icon={Timer}
            title="Aún no hay jobs"
            description="Crea uno para sincronizar carpetas de forma recurrente."
            action={
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  setEditing(null);
                  setWizardOpen(true);
                }}
              >
                <Plus />
                Nuevo job
              </Button>
            }
          />
        )}

        {data && data.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Nombre</th>
                <th className="px-2 py-2 text-left font-medium">Origen → Destino</th>
                <th className="px-2 py-2 text-left font-medium">Modo</th>
                <th className="px-2 py-2 text-left font-medium">Horario</th>
                <th className="px-2 py-2 text-left font-medium">Última ejecución</th>
                <th className="px-2 py-2 text-left font-medium">Próxima</th>
                <th className="w-12 px-2 py-2 text-center font-medium">Activo</th>
                <th className="w-32 px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.map((job) => (
                <tr key={job.id} className="border-b border-border/40 hover:bg-accent/30">
                  <td className="px-4 py-2 font-medium">{job.name}</td>
                  <td className="mono max-w-0 truncate px-2 py-2 text-muted-foreground">
                    {job.source.remote}:{job.source.path || '/'} →{' '}
                    {job.destinations.map((d) => `${d.remote}:${d.path || '/'}`).join(', ')}
                  </td>
                  <td className="px-2 py-2 capitalize">{job.mode}</td>
                  <td className="px-2 py-2 text-muted-foreground">{job.scheduleLabel}</td>
                  <td className="px-2 py-2">
                    {job.lastRun ? (
                      <Badge
                        variant={
                          job.lastRun.status === 'success'
                            ? 'success'
                            : job.lastRun.status === 'error'
                              ? 'danger'
                              : 'outline'
                        }
                      >
                        {job.lastRun.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {job.nextRunAt ? relativeTime(job.nextRunAt) : '—'}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Switch
                      checked={job.enabled}
                      disabled={toggle.isPending}
                      onCheckedChange={() => toggle.mutate(job)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconAction label="Ejecutar ahora" onClick={() => run.mutate(job)}>
                        {run.isPending ? <LoaderCircle className="animate-spin" /> : <Play />}
                      </IconAction>
                      <IconAction
                        label="Editar"
                        onClick={() => {
                          setEditing(job);
                          setWizardOpen(true);
                        }}
                      >
                        <Pencil />
                      </IconAction>
                      <IconAction label="Duplicar" onClick={() => duplicate.mutate(job)}>
                        <Copy />
                      </IconAction>
                      <IconAction label="Ver historial" onClick={() => setHistory(job)}>
                        <History />
                      </IconAction>
                      <IconAction
                        label="Eliminar"
                        destructive
                        onClick={() => setDeleting(job)}
                      >
                        <Trash2 />
                      </IconAction>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <JobWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        editing={editing}
        defaultTimezone={settings.data?.timezone ?? 'UTC'}
      />

      <JobHistoryDialog job={history} onClose={() => setHistory(null)} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Eliminar el job "${deleting?.name}"`}
        description="El historial de ejecuciones se conserva; el job deja de programarse."
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function IconAction({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className={cn(destructive && 'text-destructive')}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
