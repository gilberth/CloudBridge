import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  Copy,
  Files,
  GitCompare,
  LoaderCircle,
  MoveLeft,
  MoveRight,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CompareCategory, CompareResult, FsEntry } from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompareBar } from '@/components/explorer/CompareBar';
import { RemotePanel, type PanelController } from '@/components/explorer/RemotePanel';
import {
  TransferDialog,
  type TransferMode,
  type TransferRequest,
} from '@/components/explorer/TransferDialog';
import { usePanelState } from '@/hooks/usePanelState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHealth } from '@/hooks/useHealth';
import { cn } from '@/lib/utils';

type Side = 'left' | 'right';

export default function ExplorerPage() {
  const remotes = useQuery({ queryKey: ['remotes'], queryFn: api.remotes.list });
  const availableRemotes = useMemo(
    () => remotes.data?.map((remote) => remote.name),
    [remotes.data],
  );
  const left = usePanelState('left', availableRemotes);
  const right = usePanelState('right', availableRemotes);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [activePanel, setActivePanel] = useState<Side>('left');
  const { data: health } = useHealth();
  const offline = health ? !health.rclone.online : false;

  const controllers = useRef<Record<Side, PanelController | null>>({
    left: null,
    right: null,
  });
  const [, forceRender] = useState(0);
  const setController = useCallback((side: Side, controller: PanelController) => {
    controllers.current[side] = controller;
    forceRender((value) => value + 1);
  }, []);

  const [request, setRequest] = useState<TransferRequest | null>(null);
  const [dragging, setDragging] = useState<{ side: Side; count: number } | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [compareFilter, setCompareFilter] = useState<CompareCategory | null>(null);

  const transfer = useMutation({
    mutationFn: ({
      mode,
      dryRun,
      ignoreErrors,
      confirm,
    }: {
      mode: TransferMode;
      dryRun: boolean;
      ignoreErrors: boolean;
      confirm?: string;
    }) => {
      const current = request!;
      return api.fs.transfer(mode, {
        source: current.source,
        destination: current.destination,
        items: current.items.map((entry) => ({ name: entry.name, isDir: entry.isDir })),
        options: { dryRun, ignoreErrors },
        ...(confirm ? { confirm } : {}),
      });
    },
    onSuccess: (run) => {
      setRequest(null);
      controllers.current.left?.clearSelection();
      controllers.current.right?.clearSelection();
      toast.success(run.dryRun ? 'Simulación lanzada' : 'Transferencia lanzada', {
        description: run.label,
      });
    },
    onError: (error) =>
      toast.error('No se pudo lanzar la transferencia', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  const propose = useCallback((from: Side, mode: TransferMode, items?: FsEntry[]) => {
    const source = controllers.current[from];
    const destination = controllers.current[from === 'left' ? 'right' : 'left'];
    if (!source?.remote || !destination?.remote) {
      toast.error('Elige un remoto en ambos paneles');
      return;
    }
    setRequest({
      mode,
      source: { remote: source.remote, path: source.path },
      destination: { remote: destination.remote, path: destination.path },
      items: items ?? source.selection,
    });
  }, []);

  const runCompare = useMutation({
    mutationFn: (deep: boolean) => {
      const source = controllers.current.left;
      const destination = controllers.current.right;
      if (!source?.remote || !destination?.remote) {
        throw new ApiError(0, 'no_remote', 'Elige un remoto en ambos paneles');
      }
      return api.fs.compare({
        source: { remote: source.remote, path: source.path },
        destination: { remote: destination.remote, path: destination.path },
        deep,
      });
    },
    onSuccess: (result) => {
      setCompare(result);
      setCompareFilter(null);
      const changes =
        result.counts.onlySrc + result.counts.onlyDst + result.counts.differ;
      toast.success(
        changes === 0
          ? 'Las dos carpetas coinciden'
          : `${changes} diferencias encontradas`,
      );
    },
    onError: (error) =>
      toast.error('No se pudo comparar', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  /** Category per entry path; both panels read from the same map. */
  const compareMap = useMemo(() => {
    if (!compare) return null;
    const map = new Map<string, CompareCategory>();
    for (const row of compare.rows) {
      const path = row.src?.path ?? row.dst?.path;
      if (path) map.set(path, row.category);
    }
    return map;
  }, [compare]);

  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so clicking still selects.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragStart = (event: DragStartEvent) => {
    const side = event.active.data.current?.side as Side | undefined;
    if (!side) return;
    setDragging({ side, count: controllers.current[side]?.selection.length ?? 1 });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const from = event.active.data.current?.side as Side | undefined;
    const to = event.over?.id as Side | undefined;
    setDragging(null);
    if (!from || !to || from === to) return;
    propose(from, 'copy');
  };

  const leftReady = Boolean(controllers.current.left?.remote);
  const rightReady = Boolean(controllers.current.right?.remote);
  const bothReady = leftReady && rightReady;

  const panel = (side: Side) => (
    <RemotePanel
      side={side}
      state={side === 'left' ? left : right}
      compare={compareMap}
      compareFilter={compareFilter}
      otherPanelLabel={
        side === 'left'
          ? (controllers.current.right?.remote ?? null)
          : (controllers.current.left?.remote ?? null)
      }
      onCopyTo={(entries) => propose(side, 'copy', entries)}
      onMoveTo={(entries) => propose(side, 'move', entries)}
      onController={(controller) => setController(side, controller)}
      disabled={offline}
    />
  );

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-full flex-col">
        <PageHeader
          title="Explorer"
          description="Arrastra la selección al otro panel, o usa los botones centrales."
          className="px-2"
          actions={
            <>
              {!wide && (
                <Tabs
                  value={activePanel}
                  onValueChange={(value) => setActivePanel(value as Side)}
                >
                  <TabsList>
                    <TabsTrigger value="left">Panel A</TabsTrigger>
                    <TabsTrigger value="right">Panel B</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={!bothReady || runCompare.isPending}
                onClick={() => runCompare.mutate(false)}
              >
                {runCompare.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <GitCompare />
                )}
                Comparar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!bothReady || runCompare.isPending}
                title="Compara con hashes en vez de tamaño y fecha"
                onClick={() => runCompare.mutate(true)}
              >
                Comparación profunda
              </Button>
            </>
          }
        />

        {compare && (
          <CompareBar
            result={compare}
            filter={compareFilter}
            onFilterChange={setCompareFilter}
            onRefresh={() => runCompare.mutate(compare.deep)}
            onClose={() => {
              setCompare(null);
              setCompareFilter(null);
            }}
            refreshing={runCompare.isPending}
          />
        )}

        {wide ? (
          <PanelGroup
            direction="horizontal"
            autoSaveId="cloudbridge.explorer"
            className="min-h-0 flex-1"
          >
            <Panel defaultSize={50} minSize={20}>
              <DropZone side="left" activeFrom={dragging?.side ?? null}>
                {panel('left')}
              </DropZone>
            </Panel>

            <PanelResizeHandle className="relative w-px bg-border transition-colors data-[resize-handle-state=drag]:bg-primary">
              <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
            </PanelResizeHandle>

            <div className="flex w-[96px] shrink-0 flex-col items-center justify-center gap-1 border-x border-border bg-background px-2">
              <CentreAction
                label="Copiar hacia la derecha"
                icon={Copy}
                iconClassName="text-sky-400"
                disabled={!bothReady}
                onClick={() => propose('left', 'copy')}
              >
                Copiar →
              </CentreAction>
              <CentreAction
                label="Copiar hacia la izquierda"
                icon={Copy}
                iconClassName="text-sky-400"
                disabled={!bothReady}
                onClick={() => propose('right', 'copy')}
              >
                ← Copiar
              </CentreAction>
              <div className="my-1 h-px w-5 bg-border" />
              <CentreAction
                label="Mover hacia la derecha"
                icon={MoveRight}
                iconClassName="text-amber-400"
                disabled={!bothReady}
                onClick={() => propose('left', 'move')}
              >
                Mover →
              </CentreAction>
              <CentreAction
                label="Mover hacia la izquierda"
                icon={MoveLeft}
                iconClassName="text-amber-400"
                disabled={!bothReady}
                onClick={() => propose('right', 'move')}
              >
                ← Mover
              </CentreAction>
              <div className="my-1 h-px w-5 bg-border" />
              <CentreAction
                label="Sincronizar hacia la derecha"
                icon={RefreshCw}
                iconClassName="text-emerald-400"
                disabled={!bothReady}
                onClick={() => propose('left', 'sync')}
              >
                Sync →
              </CentreAction>
            </div>

            <Panel defaultSize={50} minSize={20}>
              <DropZone side="right" activeFrom={dragging?.side ?? null}>
                {panel('right')}
              </DropZone>
            </Panel>
          </PanelGroup>
        ) : (
          <div className="min-h-0 flex-1">{panel(activePanel)}</div>
        )}

        <TransferDialog
          request={request}
          pending={transfer.isPending}
          onClose={() => setRequest(null)}
          onConfirm={(mode, dryRun, ignoreErrors, confirm) =>
            transfer.mutate({
              mode,
              dryRun,
              ignoreErrors,
              ...(confirm ? { confirm } : {}),
            })
          }
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="flex items-center gap-1.5 rounded-md border border-primary bg-popover px-2 py-1 text-[12px] shadow-lg">
            <Files className="size-3.5 text-primary" />
            {dragging.count} elemento{dragging.count === 1 ? '' : 's'}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/** Panel wrapper that accepts a drop from the opposite panel. */
function DropZone({
  side,
  activeFrom,
  children,
}: {
  side: Side;
  activeFrom: Side | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: side });
  const canDrop = activeFrom !== null && activeFrom !== side;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-full transition-shadow',
        canDrop && 'ring-1 ring-inset ring-primary/40',
        canDrop && isOver && 'ring-2 ring-primary',
      )}
    >
      {children}
    </div>
  );
}

function CentreAction({
  label,
  icon: Icon,
  iconClassName,
  disabled,
  onClick,
  children,
}: {
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-full justify-start rounded-md border border-transparent bg-accent/25 px-2 text-[10px] leading-none hover:border-border hover:bg-accent"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className={cn('size-4', iconClassName)} aria-hidden="true" />
      {children}
    </Button>
  );
}
