import { useEffect, useState } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
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

/**
 * Confirmation modal. When `requireTyping` is set the action stays disabled
 * until the exact text is typed — used for anything that deletes data at the
 * destination.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  destructive = false,
  pending = false,
  requireTyping,
  warning,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  requireTyping?: string;
  warning?: React.ReactNode;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const blocked = requireTyping ? typed.trim() !== requireTyping : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {warning && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-[12px] text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <div className="space-y-1">{warning}</div>
          </div>
        )}

        {requireTyping && (
          <div className="space-y-1">
            <Label htmlFor="confirm-typing">
              Escribe <span className="mono text-foreground">{requireTyping}</span> para confirmar
            </Label>
            <Input
              id="confirm-typing"
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={blocked || pending}
          >
            {pending && <LoaderCircle className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
