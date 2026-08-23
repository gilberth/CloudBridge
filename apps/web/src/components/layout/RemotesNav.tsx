import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ProviderIcon } from '@/components/provider-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, humanBytes } from '@/lib/utils';

/** Configured remotes with a reachability dot and, when reported, used space. */
export function RemotesNav({ collapsed }: { collapsed: boolean }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['remotes'],
    queryFn: api.remotes.list,
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-border pt-2">
      {!collapsed && (
        <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Remotos
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {isPending && (
          <div className="space-y-1 px-1 py-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-6 w-full" />
            ))}
          </div>
        )}

        {isError && !collapsed && (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            No se pudieron cargar los remotos.
          </p>
        )}

        {data?.map((remote) => (
          <Tooltip key={remote.name} disableHoverableContent>
            <TooltipTrigger asChild>
              <Link
                to={`/explorer?left=${encodeURIComponent(remote.name)}`}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  collapsed && 'justify-center px-0',
                )}
              >
                <span className="relative flex shrink-0">
                  <ProviderIcon type={remote.type} />
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-sidebar',
                      remote.online === null
                        ? 'bg-muted-foreground'
                        : remote.online
                          ? 'bg-emerald-500'
                          : 'bg-red-500',
                    )}
                  />
                </span>
                {!collapsed && (
                  <>
                    <span className="truncate">{remote.name}</span>
                    {remote.about?.used !== undefined && (
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                        {humanBytes(remote.about.used, 0)}
                      </span>
                    )}
                  </>
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              {remote.name} · {remote.type}
              {remote.error ? ` · ${remote.error}` : ''}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="p-2">
        <Button asChild variant="outline" size="sm" className={cn('w-full', collapsed && 'px-0')}>
          <Link to="/remotes?add=1">
            <Plus />
            {!collapsed && 'Añadir remoto'}
          </Link>
        </Button>
      </div>
    </div>
  );
}
