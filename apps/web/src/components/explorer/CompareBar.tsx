import { RefreshCw, X } from 'lucide-react';
import type { CompareCategory, CompareResult } from '@cloudbridge/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LABELS: Record<CompareCategory, { text: string; dot: string; active: string }> = {
  onlySrc: { text: 'Solo en A', dot: 'bg-cmp-src', active: 'bg-cmp-src/15 text-cmp-src' },
  onlyDst: { text: 'Solo en B', dot: 'bg-cmp-dst', active: 'bg-cmp-dst/15 text-cmp-dst' },
  differ: { text: 'Distintos', dot: 'bg-cmp-differ', active: 'bg-cmp-differ/15 text-cmp-differ' },
  identical: { text: 'Idénticos', dot: 'bg-cmp-same', active: 'bg-cmp-same/20 text-cmp-same' },
};

/** Summary and category filters for an active comparison. */
export function CompareBar({
  result,
  filter,
  onFilterChange,
  onRefresh,
  onClose,
  refreshing,
}: {
  result: CompareResult;
  filter: CompareCategory | null;
  onFilterChange: (filter: CompareCategory | null) => void;
  onRefresh: () => void;
  onClose: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 text-[12px]">
      <span className="font-medium">Comparación</span>
      {result.deep && <span className="text-[10px] uppercase text-primary">hash</span>}

      <div className="flex items-center gap-1">
        {(Object.keys(LABELS) as CompareCategory[]).map((category) => {
          const meta = LABELS[category];
          const isActive = filter === category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => onFilterChange(isActive ? null : category)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-colors',
                isActive
                  ? `border-transparent ${meta.active}`
                  : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              <span className={cn('size-1.5 rounded-full', meta.dot)} />
              {meta.text}
              <span className="tabular-nums">{result.counts[category]}</span>
            </button>
          );
        })}
      </div>

      {filter && (
        <Button variant="ghost" size="sm" className="h-6" onClick={() => onFilterChange(null)}>
          Ver todo
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Actualizar comparación" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar comparación" onClick={onClose}>
          <X />
        </Button>
      </div>
    </div>
  );
}
