import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ScrollText, Search } from 'lucide-react';
import type { LogLevel } from '@cloudbridge/shared';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeleton';
import { cn, formatDateTime } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const LEVEL_VARIANT: Record<LogLevel, 'outline' | 'info' | 'warning' | 'danger'> = {
  debug: 'outline',
  info: 'info',
  warn: 'warning',
  error: 'danger',
};

const PAGE_SIZE = 100;

export default function LogsPage() {
  const [level, setLevel] = useState<LogLevel | 'all'>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  const params = {
    ...(level !== 'all' ? { level } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to).toISOString() } : {}),
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isPending, isFetching } = useQuery({
    queryKey: ['logs', params],
    queryFn: () => api.logs.list(params),
    refetchInterval: offset === 0 ? 5000 : false,
  });

  const resetAndSet = <T,>(setter: (value: T) => void) => (value: T) => {
    setOffset(0);
    setter(value);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Logs"
        description={data ? `${data.total} entradas` : undefined}
        actions={
          <a href={api.logs.exportUrl(params)} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <Download />
              Exportar .txt
            </Button>
          </a>
        }
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Select value={level} onValueChange={(value) => resetAndSet(setLevel)(value as LogLevel | 'all')}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => resetAndSet(setSearch)(event.target.value)}
            placeholder="Buscar en el mensaje…"
            className="pl-7"
          />
        </div>

        <Input
          type="datetime-local"
          value={from}
          onChange={(event) => resetAndSet(setFrom)(event.target.value)}
          className="w-44"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="datetime-local"
          value={to}
          onChange={(event) => resetAndSet(setTo)(event.target.value)}
          className="w-44"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending && <TableSkeleton rows={12} columns={3} />}

        {data?.items.length === 0 && (
          <EmptyState icon={ScrollText} title="Sin resultados" description="Prueba a ajustar los filtros." />
        )}

        {data && data.items.length > 0 && (
          <table className="mono w-full text-[12px]">
            <tbody>
              {data.items.map((entry) => (
                <tr key={entry.id} className="border-b border-border/40 align-top hover:bg-accent/30">
                  <td className="whitespace-nowrap px-4 py-1 text-muted-foreground">
                    {formatDateTime(entry.ts)}
                  </td>
                  <td className="px-2 py-1">
                    <Badge variant={LEVEL_VARIANT[entry.level]} className="uppercase">
                      {entry.level}
                    </Badge>
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{entry.source}</td>
                  <td className={cn('px-4 py-1', entry.level === 'error' && 'text-destructive')}>
                    {entry.message}
                    {entry.meta && Object.keys(entry.meta).length > 0 && (
                      <span className="ml-2 text-muted-foreground">{JSON.stringify(entry.meta)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border px-4 py-2 text-[12px]">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
          >
            Anterior
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} de {data.total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= data.total || isFetching}
            onClick={() => setOffset((value) => value + PAGE_SIZE)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
