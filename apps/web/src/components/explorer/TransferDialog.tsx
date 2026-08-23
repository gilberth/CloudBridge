import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { FsEntry, RemotePath } from '@cloudbridge/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { humanBytes } from '@/lib/utils';

export type TransferMode = 'copy' | 'move' | 'sync';

export interface TransferRequest {
  mode: TransferMode;
  source: RemotePath;
  destination: RemotePath;
  items: FsEntry[];
}

/**
 * Confirmation before anything is transferred: what moves where, how many files
 * and how big. `sync` additionally deletes at the destination, so it demands
 * the destination path typed back.
 */
export function TransferDialog({
  request,
  onClose,
  onConfirm,
  pending,
}: {
  request: TransferRequest | null;
  onClose: () => void;
  onConfirm: (mode: TransferMode, dryRun: boolean, ignoreErrors: boolean, confirm?: string) => void;
  pending: boolean;
}) {
  const [mode, setMode] = useState<TransferMode>('copy');
  const [dryRun, setDryRun] = useState(false);
  const [ignoreErrors, setIgnoreErrors] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (request) {
      setMode(request.mode);
      setDryRun(false);
      setIgnoreErrors(false);
      setTyped('');
    }
  }, [request]);

  // Directories have no size in a listing, so ask rclone for the real total.
  const wholeDirectory = request?.items.length === 0;
  const sizeQuery = useQuery({
    queryKey: ['fs-size', request?.source.remote, request?.source.path],
    queryFn: () => api.fs.size(request!.source.remote, request!.source.path),
    enabled: Boolean(request) && (wholeDirectory || request!.items.some((item) => item.isDir)),
  });

  if (!request) return null;

  const fileCount = request.items.filter((item) => !item.isDir).length;
  const dirCount = request.items.filter((item) => item.isDir).length;
  const knownBytes = request.items.reduce((sum, item) => sum + (item.isDir ? 0 : item.size), 0);

  const destructive = mode === 'sync' && !dryRun;
  const expected = `${request.destination.remote}:${request.destination.path}`;
  const blocked = destructive && typed.trim() !== expected;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar transferencia</DialogTitle>
          <DialogDescription>
            La operación se lanza en rclone y podrás seguirla en Transfers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-[12px]">
            <span className="mono min-w-0 flex-1 truncate">
              {request.source.remote}:{request.source.path}
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-primary" />
            <span className="mono min-w-0 flex-1 truncate">
              {request.destination.remote}:{request.destination.path}
            </span>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <dt className="text-muted-foreground">Elementos</dt>
              <dd className="tabular-nums">
                {wholeDirectory
                  ? 'Todo el directorio'
                  : `${fileCount} archivo(s)${dirCount ? `, ${dirCount} carpeta(s)` : ''}`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tamaño</dt>
              <dd className="tabular-nums">
                {sizeQuery.data && (wholeDirectory || dirCount > 0)
                  ? humanBytes(sizeQuery.data.bytes)
                  : humanBytes(knownBytes)}
                {sizeQuery.isFetching && <LoaderCircle className="ml-1 inline size-3 animate-spin" />}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Modo</dt>
              <dd className="capitalize">{mode}</dd>
            </div>
          </dl>

          <div className="flex gap-1">
            {(['copy', 'move', 'sync'] as const).map((option) => (
              <Button
                key={option}
                variant={mode === option ? 'default' : 'outline'}
                size="sm"
                className="flex-1 capitalize"
                onClick={() => setMode(option)}
              >
                {option}
              </Button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[12px]">
            <Checkbox checked={dryRun} onCheckedChange={(checked) => setDryRun(checked === true)} />
            <span>
              <span className="mono">--dry-run</span> — simular sin escribir nada
            </span>
          </label>

          <label className="flex items-center gap-2 text-[12px]">
            <Checkbox
              checked={ignoreErrors}
              onCheckedChange={(checked) => setIgnoreErrors(checked === true)}
            />
            <span>
              <span className="mono">--ignore-errors</span> — seguir con el resto si un archivo falla
              (en vez de abortar toda la transferencia)
            </span>
          </label>

          {mode === 'sync' && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-[12px] text-destructive">
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-3.5" />
                Sync borra en el destino
              </p>
              <p className="leading-snug">
                Todo lo que exista en el destino y no esté en el origen se eliminará. Es
                irreversible.
              </p>
              {!dryRun && (
                <div className="space-y-1">
                  <Label htmlFor="sync-confirm" className="text-destructive">
                    Escribe <span className="mono">{expected}</span> para confirmar
                  </Label>
                  <Input
                    id="sync-confirm"
                    value={typed}
                    autoComplete="off"
                    onChange={(event) => setTyped(event.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={blocked || pending}
            onClick={() =>
              onConfirm(mode, dryRun, ignoreErrors, destructive ? typed.trim() : undefined)
            }
          >
            {pending && <LoaderCircle className="animate-spin" />}
            {dryRun ? 'Simular' : 'Ejecutar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
