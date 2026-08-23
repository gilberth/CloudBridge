import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import type { Job, Run, RunStatus } from '@cloudbridge/shared';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn, formatDateTime, humanBytes, humanDuration } from '@/lib/utils';

const STATUS_ICON: Record<RunStatus, typeof CircleCheck> = {
  running: TriangleAlert,
  paused: TriangleAlert,
  success: CircleCheck,
  error: CircleX,
  cancelled: CircleX,
  interrupted: TriangleAlert,
};

export function JobHistoryDialog({
  job,
  onClose,
}: {
  job: Job | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['job-history', job?.id],
    queryFn: () => api.jobs.history(job!.id),
    enabled: job !== null,
  });

  return (
    <Dialog open={job !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historial de "{job?.name}"</DialogTitle>
          <DialogDescription>Ejecuciones más recientes primero.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[28rem] overflow-y-auto">
          {history.isPending && <TableSkeleton rows={5} columns={4} />}
          {history.isSuccess && history.data.length === 0 && (
            <EmptyState icon={CircleCheck} title="Sin ejecuciones todavía" className="py-8" />
          )}
          {history.data?.map((run) => (
            <HistoryRow
              key={run.id}
              run={run}
              expanded={expanded === run.id}
              onToggle={() => setExpanded(expanded === run.id ? null : run.id)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryRow({
  run,
  expanded,
  onToggle,
}: {
  run: Run;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = STATUS_ICON[run.status];
  const hasDetail = Boolean(run.errorMessage || run.dryRunReport);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={hasDetail ? onToggle : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px]',
          hasDetail && 'hover:bg-accent/50',
        )}
      >
        {hasDetail ? (
          expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            run.status === 'success'
              ? 'text-emerald-500'
              : run.status === 'error'
                ? 'text-destructive'
                : 'text-amber-500',
          )}
        />
        <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
          {formatDateTime(run.startedAt)}
        </span>
        <Badge
          variant={
            run.status === 'success'
              ? 'success'
              : run.status === 'error'
                ? 'danger'
                : 'outline'
          }
        >
          {run.status}
        </Badge>
        {run.dryRun && <Badge variant="outline">dry-run</Badge>}
        <span className="ml-auto tabular-nums text-muted-foreground">{run.files} archivos</span>
        <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
          {humanBytes(run.bytes)}
        </span>
        <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
          {run.durationMs != null ? humanDuration(run.durationMs / 1000) : '—'}
        </span>
      </button>

      {expanded && hasDetail && (
        <div className="mono max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-border/60 bg-muted/30 px-3 py-2 text-[11px]">
          {run.errorMessage && <p className="text-destructive">{run.errorMessage}</p>}
          {run.dryRunReport}
        </div>
      )}
    </div>
  );
}
