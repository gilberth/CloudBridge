import { useEffect, useRef } from 'react';
import {
  ArrowRightLeft,
  Copy,
  Download,
  Info,
  Link2,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { FsEntry } from '@cloudbridge/shared';

export interface ContextMenuState {
  entry: FsEntry;
  x: number;
  y: number;
}

export interface EntryActions {
  onDownload: (entry: FsEntry) => void;
  onRename: (entry: FsEntry) => void;
  onCopyTo: (entry: FsEntry) => void;
  onMoveTo: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
  onCopyPath: (entry: FsEntry) => void;
  onProperties: (entry: FsEntry) => void;
}

/**
 * Right-click menu for a file row. Rendered at the pointer instead of anchored
 * to a trigger, which is what a file manager's context menu needs.
 */
export function EntryContextMenu({
  state,
  onClose,
  actions,
  otherPanelLabel,
}: {
  state: ContextMenuState | null;
  onClose: () => void;
  actions: EntryActions;
  otherPanelLabel: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') onClose();
        return;
      }
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [state, onClose]);

  if (!state) return null;

  const { entry } = state;
  const run = (action: (entry: FsEntry) => void) => () => {
    action(entry);
    onClose();
  };

  const items = [
    ...(entry.isDir
      ? []
      : [{ icon: Download, label: 'Descargar', onSelect: run(actions.onDownload) }]),
    { icon: Pencil, label: 'Renombrar', onSelect: run(actions.onRename) },
    {
      icon: Copy,
      label: otherPanelLabel ? `Copiar a ${otherPanelLabel}` : 'Copiar a…',
      onSelect: run(actions.onCopyTo),
      disabled: !otherPanelLabel,
    },
    {
      icon: ArrowRightLeft,
      label: otherPanelLabel ? `Mover a ${otherPanelLabel}` : 'Mover a…',
      onSelect: run(actions.onMoveTo),
      disabled: !otherPanelLabel,
    },
    { icon: Link2, label: 'Copiar ruta', onSelect: run(actions.onCopyPath) },
    { icon: Info, label: 'Propiedades', onSelect: run(actions.onProperties) },
    { separator: true as const },
    { icon: Trash2, label: 'Eliminar', onSelect: run(actions.onDelete), destructive: true },
  ];

  // Keep the menu inside the viewport.
  const left = Math.min(state.x, window.innerWidth - 220);
  const top = Math.min(state.y, window.innerHeight - items.length * 30 - 16);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top }}
      className="fixed z-50 min-w-52 rounded-md border border-border bg-popover p-1 shadow-lg"
    >
      {items.map((item, index) =>
        'separator' in item ? (
          <div key={`sep-${index}`} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={item.onSelect}
            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-50 ${
              item.destructive
                ? 'text-destructive hover:bg-destructive/10'
                : 'hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <item.icon className={`size-3.5 ${item.destructive ? '' : 'text-muted-foreground'}`} />
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
