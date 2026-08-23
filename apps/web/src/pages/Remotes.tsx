import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CloudOff,
  Download,
  LoaderCircle,
  Pencil,
  Plug,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import type { RemoteSummary } from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProviderIcon } from '@/components/provider-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RemoteDialog } from '@/components/remotes/RemoteDialog';
import { humanBytes } from '@/lib/utils';

export default function RemotesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);

  // The sidebar's "+ Añadir remoto" button links here with ?add=1.
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setEditing(undefined);
      setDialogOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('add');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['remotes'],
    queryFn: api.remotes.list,
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.remotes.remove(name),
    onSuccess: (_result, name) => {
      void queryClient.invalidateQueries({ queryKey: ['remotes'] });
      toast.success(`Remoto "${name}" eliminado`);
      setDeleting(null);
    },
    onError: (cause) =>
      toast.error('No se pudo eliminar el remoto', {
        description: cause instanceof ApiError ? cause.message : String(cause),
      }),
  });

  const exportConfig = useMutation({
    mutationFn: api.remotes.exportConfig,
    onSuccess: ({ config }) => {
      const blob = new Blob([config], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'rclone.conf';
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (cause) =>
      toast.error('No se pudo exportar la configuración', {
        description: cause instanceof ApiError ? cause.message : String(cause),
      }),
  });

  const importConfig = useMutation({
    mutationFn: (config: string) => api.remotes.importConfig(config),
    onSuccess: ({ imported }) => {
      void queryClient.invalidateQueries({ queryKey: ['remotes'] });
      toast.success(`${imported} remotos importados`);
    },
    onError: (cause) =>
      toast.error('No se pudo importar la configuración', {
        description: cause instanceof ApiError ? cause.message : String(cause),
      }),
  });

  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.conf,.txt,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) importConfig.mutate(await file.text());
    };
    input.click();
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Remotes"
        description={data ? `${data.length} remotos configurados` : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={pickFile} disabled={importConfig.isPending}>
              <Upload />
              Importar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportConfig.mutate()}
              disabled={exportConfig.isPending}
            >
              <Download />
              Exportar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <Plus />
              Añadir remoto
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isPending && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            icon={CloudOff}
            title="No se pudieron cargar los remotos"
            description={error instanceof ApiError ? error.message : undefined}
          />
        )}

        {data?.length === 0 && (
          <EmptyState
            icon={CloudOff}
            title="Aún no hay remotos"
            description="Añade el primero para empezar a explorar y sincronizar."
            action={
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  setEditing(undefined);
                  setDialogOpen(true);
                }}
              >
                <Plus />
                Añadir remoto
              </Button>
            }
          />
        )}

        {data && data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((remote) => (
              <RemoteCard
                key={remote.name}
                remote={remote}
                onEdit={() => {
                  setEditing(remote.name);
                  setDialogOpen(true);
                }}
                onDelete={() => setDeleting(remote.name)}
              />
            ))}
          </div>
        )}
      </div>

      <RemoteDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Eliminar el remoto "${deleting}"`}
        description="Se borra de la configuración de rclone. Los archivos del proveedor no se tocan, pero los jobs que lo usen dejarán de funcionar."
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function RemoteCard({
  remote,
  onEdit,
  onDelete,
}: {
  remote: RemoteSummary;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const test = useMutation({
    mutationFn: () => api.remotes.test(remote.name),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['remotes'] });
      if (result.online) toast.success(`"${remote.name}" responde correctamente`);
      else toast.error(`"${remote.name}" no responde`, { description: result.error ?? undefined });
    },
  });

  const { used, total } = remote.about ?? {};
  const percentage = used !== undefined && total ? (used / total) * 100 : null;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <ProviderIcon type={remote.type} className="mt-0.5 size-5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{remote.name}</p>
          <p className="mono text-[11px] text-muted-foreground">{remote.type}</p>
        </div>
        <Badge variant={remote.online === null ? 'outline' : remote.online ? 'success' : 'danger'}>
          {remote.online === null ? 'sin probar' : remote.online ? 'conectado' : 'error'}
        </Badge>
      </div>

      {percentage !== null ? (
        <div className="space-y-1">
          <Progress value={percentage} />
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {humanBytes(used)} de {humanBytes(total)} · {percentage.toFixed(0)}%
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {remote.error ?? 'Este backend no informa del espacio disponible.'}
        </p>
      )}

      <div className="mt-auto flex items-center gap-1 pt-1">
        <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isPending ? <LoaderCircle className="animate-spin" /> : <Plug />}
          Probar
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil />
          Editar
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Eliminar remoto" className="ml-auto text-destructive" onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
