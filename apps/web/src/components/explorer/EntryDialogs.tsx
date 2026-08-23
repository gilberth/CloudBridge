import { useEffect, useState } from 'react';
import type { FsEntry } from '@cloudbridge/shared';
import { Button } from '@/components/ui/button';
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
import { formatDateTime, humanBytes } from '@/lib/utils';

export function RenameDialog({
  entry,
  onClose,
  onSubmit,
  pending,
}: {
  entry: FsEntry | null;
  onClose: () => void;
  onSubmit: (newName: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  useEffect(() => setName(entry?.name ?? ''), [entry]);

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Renombrar</DialogTitle>
          <DialogDescription className="mono">{entry?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="rename-input">Nuevo nombre</Label>
          <Input
            id="rename-input"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) onSubmit(name.trim());
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSubmit(name.trim())}
            disabled={pending || !name.trim() || name.trim() === entry?.name}
          >
            Renombrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewFolderDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (!open) setName('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva carpeta</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="folder-input">Nombre</Label>
          <Input
            id="folder-input"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) onSubmit(name.trim());
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSubmit(name.trim())} disabled={pending || !name.trim()}>
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PropertiesDialog({
  entry,
  remote,
  path,
  onClose,
}: {
  entry: FsEntry | null;
  remote: string;
  path: string;
  onClose: () => void;
}) {
  const rows: [string, string][] = entry
    ? [
        ['Nombre', entry.name],
        ['Tipo', entry.isDir ? 'Carpeta' : (entry.mimeType || 'Archivo')],
        ['Tamaño', entry.isDir ? '—' : `${humanBytes(entry.size)} (${entry.size} bytes)`],
        ['Modificado', formatDateTime(entry.modTime)],
        ['Ruta', `${remote}:${path ? `${path}/` : ''}${entry.name}`],
        ...Object.entries(entry.hashes ?? {}).map(
          ([algorithm, value]) => [algorithm.toUpperCase(), value] as [string, string],
        ),
      ]
    : [];

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Propiedades</DialogTitle>
        </DialogHeader>
        <dl className="space-y-1.5 text-[12px]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="mono min-w-0 break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
