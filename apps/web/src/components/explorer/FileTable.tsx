import { useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
} from '@tanstack/react-table';
import { useDraggable } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, MoreVertical } from 'lucide-react';
import type { CompareCategory, FsEntry } from '@cloudbridge/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { FileTypeIcon } from '@/components/file-icon';
import { cn, formatDateTime, humanBytes } from '@/lib/utils';

export interface FileRow extends FsEntry {
  /** Set while a comparison is active, so the row can be tinted. */
  compare?: CompareCategory;
  /** The deep comparison found different hashes despite matching size/mtime. */
  hashMismatch?: boolean;
}

const COMPARE_STYLES: Record<CompareCategory, string> = {
  onlySrc: 'bg-cmp-src/10 text-cmp-src',
  onlyDst: 'bg-cmp-dst/10 text-cmp-dst',
  differ: 'bg-cmp-differ/10 text-cmp-differ',
  identical: 'text-cmp-same',
};

const DEFAULT_COLUMN_SIZING: ColumnSizingState = {
  name: 180,
  size: 90,
  modTime: 140,
};

const columnSizingStorageKey = (side: 'left' | 'right') =>
  `cloudbridge.explorer.${side}ColumnSizing`;

function readColumnSizing(side: 'left' | 'right'): ColumnSizingState {
  try {
    const stored = window.localStorage.getItem(columnSizingStorageKey(side));
    if (!stored) return DEFAULT_COLUMN_SIZING;
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(DEFAULT_COLUMN_SIZING).map(([key, fallback]) => [
        key,
        typeof parsed[key] === 'number' && Number.isFinite(parsed[key])
          ? parsed[key]
          : fallback,
      ]),
    );
  } catch {
    return DEFAULT_COLUMN_SIZING;
  }
}

function storeColumnSizing(side: 'left' | 'right', sizing: ColumnSizingState) {
  try {
    window.localStorage.setItem(columnSizingStorageKey(side), JSON.stringify(sizing));
  } catch {
    // Resizing still works for this session when storage is unavailable.
  }
}

export function FileTable({
  entries,
  selected,
  onSelectionChange,
  onOpen,
  onContextMenu,
  sorting,
  onSortingChange,
  side,
  onDragStart,
}: {
  entries: FileRow[];
  selected: Set<string>;
  onSelectionChange: (next: Set<string>, anchorIndex: number | null) => void;
  onOpen: (entry: FsEntry) => void;
  onContextMenu: (entry: FsEntry, event: React.MouseEvent) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  side: 'left' | 'right';
  /** Lets the Explorer promote the dragged row into the selection. */
  onDragStart: (entry: FsEntry) => void;
}) {
  const allSelected = entries.length > 0 && selected.size === entries.length;
  const someSelected = selected.size > 0 && !allSelected;
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() =>
    readColumnSizing(side),
  );

  const columns = useMemo<ColumnDef<FileRow>[]>(
    () => [
      {
        id: 'select',
        size: 32,
        enableResizing: false,
        header: () => (
          <Checkbox
            aria-label="Seleccionar todo"
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={(checked) =>
              onSelectionChange(
                checked ? new Set(entries.map((entry) => entry.name)) : new Set(),
                null,
              )
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Seleccionar ${row.original.name}`}
            checked={selected.has(row.original.name)}
            onCheckedChange={() => {
              const next = new Set(selected);
              if (next.has(row.original.name)) next.delete(row.original.name);
              else next.add(row.original.name);
              onSelectionChange(next, row.index);
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'name',
        header: 'Nombre',
        accessorKey: 'name',
        size: DEFAULT_COLUMN_SIZING.name,
        minSize: 120,
        maxSize: 800,
        sortingFn: (a, b) => {
          if (a.original.isDir !== b.original.isDir) return a.original.isDir ? -1 : 1;
          return a.original.name.localeCompare(b.original.name, 'es', { numeric: true });
        },
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <FileTypeIcon name={row.original.name} isDir={row.original.isDir} />
            <span className="truncate">{row.original.name}</span>
            {row.original.compare === 'differ' && row.original.hashMismatch && (
              <span className="shrink-0 text-[10px] uppercase">hash</span>
            )}
          </div>
        ),
      },
      {
        id: 'size',
        header: 'Tamaño',
        accessorKey: 'size',
        size: 90,
        minSize: 72,
        maxSize: 220,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.isDir ? '—' : humanBytes(row.original.size)}
          </span>
        ),
      },
      {
        id: 'modTime',
        header: 'Modificado',
        accessorKey: 'modTime',
        size: 140,
        minSize: 110,
        maxSize: 280,
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDateTime(row.original.modTime)}
          </span>
        ),
      },
      {
        id: 'actions',
        size: 32,
        enableResizing: false,
        header: () => null,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            aria-label={`Acciones de ${row.original.name}`}
            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onContextMenu(row.original, event);
            }}
          >
            <MoreVertical className="size-3.5" />
          </button>
        ),
      },
    ],
    [entries, selected, allSelected, someSelected, onSelectionChange, onContextMenu],
  );

  // The row is also a dnd-kit draggable (`DraggableRow` below), whose pointer
  // listeners intercept the click sequence closely enough that the browser
  // doesn't reliably synthesize a native `dblclick` on it — the second click
  // just lands as another single click. Detect the double-click ourselves
  // from click timing/target instead of relying on `onDoubleClick`.
  const lastClickRef = useRef<{ name: string; time: number } | null>(null);

  const table = useReactTable({
    data: entries,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: (updater) =>
      onSortingChange(typeof updater === 'function' ? updater(sorting) : updater),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    onColumnSizingChange: (updater) =>
      setColumnSizing((current) => {
        const next = typeof updater === 'function' ? updater(current) : updater;
        storeColumnSizing(side, next);
        return next;
      }),
  });

  return (
    <table
      className="min-w-full table-fixed border-collapse text-[13px]"
      style={{ width: table.getTotalSize() }}
    >
      <colgroup>
        {table.getAllLeafColumns().map((column) => (
          <col key={column.id} style={{ width: column.getSize() }} />
        ))}
      </colgroup>
      <thead className="sticky top-0 z-10 bg-surface">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b border-border">
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                style={{ width: header.getSize() }}
                className={cn(
                  'relative px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground',
                  header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground',
                )}
                onClick={header.column.getToggleSortingHandler()}
              >
                <span className="flex items-center gap-1">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' && <ArrowUp className="size-3" />}
                  {header.column.getIsSorted() === 'desc' && <ArrowDown className="size-3" />}
                </span>
                {header.column.getCanResize() && (
                  <ColumnResizeHandle
                    label={String(header.column.columnDef.header)}
                    resizing={header.column.getIsResizing()}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onKeyboardResize={(delta) =>
                      table.setColumnSizing((current) => ({
                        ...current,
                        [header.column.id]: header.column.getSize() + delta,
                      }))
                    }
                  />
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <DraggableRow
            key={row.original.name}
            side={side}
            entry={row.original}
            selected={selected.has(row.original.name)}
            compareClass={row.original.compare ? COMPARE_STYLES[row.original.compare] : undefined}
            onDragStart={onDragStart}
            onClick={(event) => {
              const name = row.original.name;
              const now = Date.now();
              const last = lastClickRef.current;
              lastClickRef.current = { name, time: now };
              if (last && last.name === name && now - last.time < 400) {
                lastClickRef.current = null;
                onOpen(row.original);
                return;
              }
              if (event.shiftKey || event.ctrlKey || event.metaKey) {
                handleRangeClick(event, row.index, entries, selected, onSelectionChange);
              } else {
                onSelectionChange(new Set([row.original.name]), row.index);
              }
            }}
            onDoubleClick={() => onOpen(row.original)}
            onContextMenu={(event) => {
              event.preventDefault();
              onContextMenu(row.original, event);
            }}
          >
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className="max-w-0 px-2 py-1">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </DraggableRow>
        ))}
      </tbody>
    </table>
  );
}

function ColumnResizeHandle({
  label,
  resizing,
  onMouseDown,
  onTouchStart,
  onKeyboardResize,
}: {
  label: string;
  resizing: boolean;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onTouchStart: React.TouchEventHandler<HTMLDivElement>;
  onKeyboardResize: (delta: number) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={`Redimensionar columna ${label}`}
      aria-orientation="vertical"
      tabIndex={0}
      className="group/resize absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none select-none outline-none"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown(event);
      }}
      onTouchStart={(event) => {
        event.stopPropagation();
        onTouchStart(event);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        onKeyboardResize(event.key === 'ArrowLeft' ? -10 : 10);
      }}
    >
      <span
        className={cn(
          'absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover/resize:bg-primary group-focus/resize:bg-primary',
          resizing && 'bg-primary',
        )}
      />
    </div>
  );
}

/** Ctrl/Cmd toggles a single row; Shift extends from the last anchor. */
function handleRangeClick(
  event: React.MouseEvent,
  index: number,
  entries: FileRow[],
  selected: Set<string>,
  onSelectionChange: (next: Set<string>, anchorIndex: number | null) => void,
) {
  const next = new Set(selected);
  const name = entries[index]?.name;
  if (!name) return;

  if (event.ctrlKey || event.metaKey) {
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onSelectionChange(next, index);
    return;
  }

  const anchor = entries.findIndex((entry) => selected.has(entry.name));
  const from = anchor === -1 ? index : Math.min(anchor, index);
  const to = anchor === -1 ? index : Math.max(anchor, index);
  for (let cursor = from; cursor <= to; cursor += 1) {
    const entry = entries[cursor];
    if (entry) next.add(entry.name);
  }
  onSelectionChange(next, index);
}

/**
 * A table row that can be dragged onto the other panel. The drag carries the
 * panel it came from; the Explorer resolves it to the whole current selection.
 */
function DraggableRow({
  side,
  entry,
  selected,
  compareClass,
  onDragStart,
  children,
  ...handlers
}: {
  side: 'left' | 'right';
  entry: FsEntry;
  selected: boolean;
  compareClass?: string;
  onDragStart: (entry: FsEntry) => void;
  children: React.ReactNode;
} & Pick<React.HTMLAttributes<HTMLTableRowElement>, 'onClick' | 'onDoubleClick' | 'onContextMenu'>) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${side}:${entry.name}`,
    data: { side, entry },
  });

  return (
    <tr
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...handlers}
      onPointerDown={(event) => {
        onDragStart(entry);
        listeners?.onPointerDown?.(event);
      }}
      className={cn(
        'group cursor-default border-b border-border/40 transition-colors hover:bg-accent/50',
        selected && 'bg-primary/10 hover:bg-primary/15',
        isDragging && 'opacity-40',
        compareClass,
      )}
    >
      {children}
    </tr>
  );
}
