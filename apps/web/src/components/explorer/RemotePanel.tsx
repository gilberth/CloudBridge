import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import {
  CornerLeftUp,
  FolderPlus,
  Grid2x2,
  List,
  RefreshCw,
  Search,
  ServerCrash,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CompareCategory, FsEntry } from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FileTypeIcon } from '@/components/file-icon';
import { childPath, parentOf, type PanelState } from '@/hooks/usePanelState';
import { cn, humanBytes } from '@/lib/utils';
import { FileTable, type FileRow } from './FileTable';
import { PathBreadcrumb } from './PathBreadcrumb';
import { RemoteCombobox } from './RemoteCombobox';
import { EntryContextMenu, type ContextMenuState } from './EntryContextMenu';
import { NewFolderDialog, PropertiesDialog, RenameDialog } from './EntryDialogs';

export interface PanelController {
  remote: string | null;
  path: string;
  /** Currently selected entry names in this panel. */
  selection: FsEntry[];
  clearSelection: () => void;
  refresh: () => void;
}

export function RemotePanel({
  side,
  state,
  compare,
  otherPanelLabel,
  onCopyTo,
  onMoveTo,
  onController,
  compareFilter,
  disabled,
}: {
  side: 'left' | 'right';
  state: PanelState;
  /** Comparison result keyed by entry path, when a compare is active. */
  compare?: Map<string, CompareCategory> | null;
  otherPanelLabel: string | null;
  onCopyTo: (entries: FsEntry[]) => void;
  onMoveTo: (entries: FsEntry[]) => void;
  onController: (controller: PanelController) => void;
  /** When a comparison is active, show only rows of this category. */
  compareFilter?: CompareCategory | null;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const { remote, path } = state;
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<FsEntry | null>(null);
  const [properties, setProperties] = useState<FsEntry | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [deleting, setDeleting] = useState<FsEntry[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const listing = useQuery({
    queryKey: ['fs', remote, path],
    queryFn: () => api.fs.list(remote!, path),
    enabled: Boolean(remote) && !disabled,
  });

  const entries = useMemo<FileRow[]>(() => {
    const all = listing.data?.entries ?? [];
    const filtered = search
      ? all.filter((entry) => entry.name.toLowerCase().includes(search.toLowerCase()))
      : all;
    if (!compare) return filtered;
    const tinted: FileRow[] = filtered.map((entry) => {
      const category = compare.get(entry.path);
      return category ? { ...entry, compare: category } : entry;
    });
    return compareFilter ? tinted.filter((entry) => entry.compare === compareFilter) : tinted;
  }, [listing.data, search, compare, compareFilter]);

  const selectionEntries = useMemo(
    () => entries.filter((entry) => selected.has(entry.name)),
    [entries, selected],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['fs', remote, path] });
  }, [queryClient, remote, path]);

  // Publish this panel's state upwards so the Explorer can drive the centre buttons.
  const controller = useMemo<PanelController>(
    () => ({
      remote,
      path,
      selection: selectionEntries,
      clearSelection: () => setSelected(new Set()),
      refresh,
    }),
    [remote, path, selectionEntries, refresh],
  );
  const lastPublished = useRef<PanelController | null>(null);
  if (lastPublished.current !== controller) {
    lastPublished.current = controller;
    onController(controller);
  }

  const open = useCallback(
    (entry: FsEntry) => {
      if (!entry.isDir) return;
      setSelected(new Set());
      state.setPath(childPath(path, entry.name));
    },
    [path, state],
  );

  const mkdir = useMutation({
    mutationFn: (name: string) => api.fs.mkdir(remote!, childPath(path, name)),
    onSuccess: () => {
      setNewFolder(false);
      refresh();
      toast.success('Carpeta creada');
    },
    onError: (error) =>
      toast.error('No se pudo crear la carpeta', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const rename = useMutation({
    mutationFn: ({ entry, name }: { entry: FsEntry; name: string }) =>
      api.fs.rename(remote!, childPath(path, entry.name), childPath(path, name), entry.isDir),
    onSuccess: () => {
      setRenaming(null);
      setSelected(new Set());
      refresh();
      toast.success('Renombrado');
    },
    onError: (error) =>
      toast.error('No se pudo renombrar', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const remove = useMutation({
    mutationFn: (targets: FsEntry[]) =>
      api.fs.remove(
        remote!,
        targets.map((entry) => ({ path: childPath(path, entry.name), isDir: entry.isDir })),
      ),
    onSuccess: (_result, targets) => {
      setDeleting(null);
      setSelected(new Set());
      refresh();
      toast.success(`${targets.length} elementos eliminados`);
    },
    onError: (error) =>
      toast.error('No se pudo eliminar', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      setSelected(new Set(entries.map((entry) => entry.name)));
    }
    if (event.key === 'Delete' && selectionEntries.length > 0) {
      event.preventDefault();
      setDeleting(selectionEntries);
    }
    if (event.key === 'Backspace' && path) {
      event.preventDefault();
      state.setPath(parentOf(path));
    }
  };

  const totalSize = entries.reduce((sum, entry) => sum + (entry.isDir ? 0 : entry.size), 0);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex h-full min-w-0 flex-col bg-surface outline-none"
      aria-label={`Panel ${side === 'left' ? 'izquierdo' : 'derecho'}`}
    >
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <RemoteCombobox value={remote} onChange={(next) => state.setRemote(next)} />
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Carpeta superior"
                disabled={!remote || !path}
                onClick={() => state.setPath(parentOf(path))}
              >
                <CornerLeftUp />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Carpeta superior</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Nueva carpeta"
                disabled={!remote}
                onClick={() => setNewFolder(true)}
              >
                <FolderPlus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nueva carpeta</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={view === 'list' ? 'Ver en cuadrícula' : 'Ver en lista'}
                onClick={() => setView(view === 'list' ? 'grid' : 'list')}
              >
                {view === 'list' ? <Grid2x2 /> : <List />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{view === 'list' ? 'Ver en cuadrícula' : 'Ver en lista'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Refrescar"
                disabled={!remote}
                onClick={refresh}
              >
                <RefreshCw className={listing.isFetching ? 'animate-spin' : undefined} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refrescar</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {remote && (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
          <PathBreadcrumb remote={remote} path={path} onNavigate={state.setPath} className="flex-1" />
          <div className="relative w-40 shrink-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filtrar…"
              className="h-6 pl-6 text-[12px]"
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {!remote && (
          <EmptyState
            icon={ServerCrash}
            title="Elige un remoto"
            description="Selecciona un remoto en la parte superior para explorar sus archivos."
          />
        )}

        {remote && listing.isPending && <TableSkeleton rows={10} columns={4} />}

        {remote && listing.isError && (
          <EmptyState
            icon={ServerCrash}
            title="No se pudo listar la carpeta"
            description={
              listing.error instanceof ApiError ? listing.error.message : 'Error desconocido'
            }
            action={
              <Button variant="outline" size="sm" className="mt-2" onClick={refresh}>
                Reintentar
              </Button>
            }
          />
        )}

        {remote && listing.isSuccess && entries.length === 0 && (
          <EmptyState
            icon={FolderPlus}
            title={search ? 'Sin coincidencias' : 'Carpeta vacía'}
            description={search ? 'Prueba con otro filtro.' : undefined}
          />
        )}

        {remote && listing.isSuccess && entries.length > 0 && view === 'list' && (
          <FileTable
            entries={entries}
            selected={selected}
            onSelectionChange={(next) => setSelected(next)}
            onOpen={open}
            onContextMenu={(entry, event) => {
              if (!selected.has(entry.name)) setSelected(new Set([entry.name]));
              setMenu({ entry, x: event.clientX, y: event.clientY });
            }}
            sorting={sorting}
            onSortingChange={setSorting}
            side={side}
            onDragStart={(entry) => {
              // Dragging a row that is not selected makes it the selection.
              if (!selected.has(entry.name)) setSelected(new Set([entry.name]));
            }}
          />
        )}

        {remote && listing.isSuccess && entries.length > 0 && view === 'grid' && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1 p-2">
            {entries.map((entry) => (
              <button
                key={entry.name}
                type="button"
                onClick={() => setSelected(new Set([entry.name]))}
                onDoubleClick={() => open(entry)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setSelected(new Set([entry.name]));
                  setMenu({ entry, x: event.clientX, y: event.clientY });
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md p-2 text-center transition-colors hover:bg-accent/60',
                  selected.has(entry.name) && 'bg-primary/10',
                )}
              >
                <FileTypeIcon name={entry.name} isDir={entry.isDir} className="size-6" />
                <span className="w-full truncate text-[12px]">{entry.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {entry.isDir ? '—' : humanBytes(entry.size)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-border px-2 text-[11px] text-muted-foreground">
        <span>{entries.length} elementos</span>
        <span>{humanBytes(totalSize)}</span>
        {selected.size > 0 && (
          <span className="ml-auto text-primary">{selected.size} seleccionados</span>
        )}
      </div>

      <EntryContextMenu
        state={menu}
        onClose={() => setMenu(null)}
        otherPanelLabel={otherPanelLabel}
        actions={{
          onDownload: (entry) => {
            window.location.href = api.fs.downloadUrl(remote!, childPath(path, entry.name));
          },
          onRename: setRenaming,
          onCopyTo: () => onCopyTo(selectionEntries),
          onMoveTo: () => onMoveTo(selectionEntries),
          onDelete: () => setDeleting(selectionEntries),
          onCopyPath: (entry) => {
            void navigator.clipboard.writeText(`${remote}:${childPath(path, entry.name)}`);
            toast.success('Ruta copiada');
          },
          onProperties: setProperties,
        }}
      />

      <RenameDialog
        entry={renaming}
        pending={rename.isPending}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => renaming && rename.mutate({ entry: renaming, name })}
      />

      <NewFolderDialog
        open={newFolder}
        onOpenChange={setNewFolder}
        pending={mkdir.isPending}
        onSubmit={(name) => mkdir.mutate(name)}
      />

      <PropertiesDialog
        entry={properties}
        remote={remote ?? ''}
        path={path}
        onClose={() => setProperties(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Eliminar ${deleting?.length ?? 0} elemento(s)`}
        description="Esta acción borra los datos en el proveedor y no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        pending={remove.isPending}
        warning={
          deleting?.some((entry) => entry.isDir) ? (
            <span>Incluye carpetas: se eliminará todo su contenido.</span>
          ) : undefined
        }
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}
