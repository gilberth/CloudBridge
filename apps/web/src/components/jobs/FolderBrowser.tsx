import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CornerLeftUp, Folder, FolderOpen } from 'lucide-react';
import type { RemotePath } from '@cloudbridge/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { RemoteCombobox } from '@/components/explorer/RemoteCombobox';
import { PathBreadcrumb } from '@/components/explorer/PathBreadcrumb';
import { childPath, parentOf } from '@/hooks/usePanelState';
import { cn } from '@/lib/utils';

/**
 * Embedded folder picker used by the job wizard. Only directories are listed:
 * a job always operates on a directory, never on a single file.
 */
export function FolderBrowser({
  value,
  onChange,
  className,
}: {
  value: RemotePath | null;
  onChange: (value: RemotePath) => void;
  className?: string;
}) {
  const [browsing, setBrowsing] = useState(value?.path ?? '');
  const remote = value?.remote ?? null;

  const listing = useQuery({
    queryKey: ['fs', remote, browsing],
    queryFn: () => api.fs.list(remote!, browsing),
    enabled: Boolean(remote),
  });

  const directories = (listing.data?.entries ?? []).filter((entry) => entry.isDir);

  const navigate = (path: string) => {
    setBrowsing(path);
    if (remote) onChange({ remote, path });
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5">
        <RemoteCombobox
          value={remote}
          onChange={(next) => {
            setBrowsing('');
            onChange({ remote: next, path: '' });
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!remote || !browsing}
          onClick={() => navigate(parentOf(browsing))}
        >
          <CornerLeftUp />
        </Button>
        {remote && (
          <PathBreadcrumb
            remote={remote}
            path={browsing}
            onNavigate={navigate}
            className="min-w-0 flex-1"
          />
        )}
      </div>

      <div className="h-44 overflow-y-auto rounded-md border border-border">
        {!remote && (
          <p className="p-4 text-center text-[12px] text-muted-foreground">
            Elige un remoto para navegar.
          </p>
        )}
        {remote && listing.isPending && (
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        )}
        {remote && listing.isError && (
          <p className="p-4 text-center text-[12px] text-destructive">
            No se pudo listar la carpeta.
          </p>
        )}
        {remote && listing.isSuccess && directories.length === 0 && (
          <p className="p-4 text-center text-[12px] text-muted-foreground">
            No hay subcarpetas. Se usará esta ruta.
          </p>
        )}
        {directories.map((entry) => (
          <button
            key={entry.name}
            type="button"
            onDoubleClick={() => navigate(childPath(browsing, entry.name))}
            onClick={() => navigate(childPath(browsing, entry.name))}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent"
          >
            <Folder className="size-3.5 text-primary" />
            {entry.name}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <Label htmlFor="manual-path" className="flex items-center gap-1.5">
          <FolderOpen className="size-3" />
          Ruta seleccionada
        </Label>
        <div className="flex items-center gap-1.5">
          <span className="mono shrink-0 text-[12px] text-muted-foreground">{remote ?? '—'}:</span>
          <Input
            id="manual-path"
            className="mono h-7 text-[12px]"
            value={browsing}
            placeholder="(raíz del remoto)"
            disabled={!remote}
            onChange={(event) => {
              setBrowsing(event.target.value);
              if (remote) onChange({ remote, path: event.target.value });
            }}
          />
        </div>
      </div>
    </div>
  );
}
