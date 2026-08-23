import { useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { FsEntry } from '@cloudbridge/shared';
import { ApiError, api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RemotePanel,
  type PanelController,
} from '@/components/explorer/RemotePanel';
import {
  TransferDialog,
  type TransferMode,
  type TransferRequest,
} from '@/components/explorer/TransferDialog';
import { usePanelState } from '@/hooks/usePanelState';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHealth } from '@/hooks/useHealth';

export default function ExplorerPage() {
  const left = usePanelState('left');
  const right = usePanelState('right');
  const wide = useMediaQuery('(min-width: 1024px)');
  const [activePanel, setActivePanel] = useState<'left' | 'right'>('left');
  const { data: health } = useHealth();
  const offline = health ? !health.rclone.online : false;

  const controllers = useRef<{ left: PanelController | null; right: PanelController | null }>({
    left: null,
    right: null,
  });
  const [, forceRender] = useState(0);

  const setController = useCallback((side: 'left' | 'right', controller: PanelController) => {
    controllers.current[side] = controller;
    // Re-render so the centre buttons reflect the new selection.
    forceRender((value) => value + 1);
  }, []);

  const [request, setRequest] = useState<TransferRequest | null>(null);

  const transfer = useMutation({
    mutationFn: ({
      mode,
      dryRun,
      confirm,
    }: {
      mode: TransferMode;
      dryRun: boolean;
      confirm?: string;
    }) => {
      const current = request!;
      return api.fs.transfer(mode, {
        source: current.source,
        destination: current.destination,
        items: current.items.map((entry) => ({ name: entry.name, isDir: entry.isDir })),
        options: { dryRun },
        ...(confirm ? { confirm } : {}),
      });
    },
    onSuccess: (run) => {
      setRequest(null);
      controllers.current.left?.clearSelection();
      controllers.current.right?.clearSelection();
      toast.success(run.dryRun ? 'Simulación lanzada' : 'Transferencia lanzada', {
        description: run.label,
        action: { label: 'Ver en Transfers', onClick: () => window.location.assign('/transfers') },
      });
    },
    onError: (error) =>
      toast.error('No se pudo lanzar la transferencia', {
        description: error instanceof ApiError ? error.message : String(error),
      }),
  });

  /** Build a transfer request from one panel towards the other. */
  const propose = useCallback(
    (from: 'left' | 'right', mode: TransferMode, items?: FsEntry[]) => {
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
    },
    [],
  );

  const leftReady = Boolean(controllers.current.left?.remote);
  const rightReady = Boolean(controllers.current.right?.remote);
  const bothReady = leftReady && rightReady;

  const panel = (side: 'left' | 'right') => (
    <RemotePanel
      side={side}
      state={side === 'left' ? left : right}
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
    <div className="flex h-full flex-col">
      <PageHeader
        title="Explorer"
        description="Arrastra entre paneles o usa los botones centrales para copiar, mover y sincronizar."
        actions={
          !wide ? (
            <Tabs value={activePanel} onValueChange={(value) => setActivePanel(value as 'left' | 'right')}>
              <TabsList>
                <TabsTrigger value="left">Panel A</TabsTrigger>
                <TabsTrigger value="right">Panel B</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : undefined
        }
      />

      {wide ? (
        <PanelGroup direction="horizontal" autoSaveId="cloudbridge.explorer" className="min-h-0 flex-1">
          <Panel defaultSize={50} minSize={20}>
            {panel('left')}
          </Panel>

          <PanelResizeHandle className="group relative w-px bg-border transition-colors data-[resize-handle-state=drag]:bg-primary">
            <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
          </PanelResizeHandle>

          <div className="flex w-11 shrink-0 flex-col items-center justify-center gap-1 border-x border-border bg-background px-1">
            <CentreButton
              label="Copiar hacia la derecha"
              disabled={!bothReady}
              onClick={() => propose('left', 'copy')}
            >
              <ArrowRight />
            </CentreButton>
            <CentreButton
              label="Copiar hacia la izquierda"
              disabled={!bothReady}
              onClick={() => propose('right', 'copy')}
            >
              <ArrowLeft />
            </CentreButton>
            <div className="my-1 h-px w-5 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full px-0 text-[10px]"
              disabled={!bothReady}
              onClick={() => propose('left', 'move')}
            >
              Mover →
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full px-0 text-[10px]"
              disabled={!bothReady}
              onClick={() => propose('right', 'move')}
            >
              ← Mover
            </Button>
            <div className="my-1 h-px w-5 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full px-0 text-[10px]"
              disabled={!bothReady}
              onClick={() => propose('left', 'sync')}
            >
              Sync →
            </Button>
          </div>

          <Panel defaultSize={50} minSize={20}>
            {panel('right')}
          </Panel>
        </PanelGroup>
      ) : (
        <div className="min-h-0 flex-1">{panel(activePanel)}</div>
      )}

      <TransferDialog
        request={request}
        pending={transfer.isPending}
        onClose={() => setRequest(null)}
        onConfirm={(mode, dryRun, confirm) =>
          transfer.mutate({ mode, dryRun, ...(confirm ? { confirm } : {}) })
        }
      />
    </div>
  );
}

function CentreButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
