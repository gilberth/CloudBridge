import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHealth } from '@/hooks/useHealth';
import { useStats } from '@/hooks/useStats';

/**
 * Shown whenever the rclone daemon is unreachable. Actions across the app are
 * disabled while this is visible instead of failing one request at a time.
 */
export function DaemonBanner() {
  const { data, isError, error, refetch, isFetching } = useHealth();
  const { health: liveHealth } = useStats();
  // The websocket reports the daemon every second; fall back to /api/health.
  const offline = liveHealth ? !liveHealth.online : isError || (data ? !data.rclone.online : false);
  if (!offline) return null;

  const message = isError
    ? error instanceof Error
      ? error.message
      : 'CloudBridge no responde'
    : (liveHealth?.error ?? data?.rclone.error ?? 'El daemon rclone no responde');

  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[12px] text-amber-700 dark:text-amber-300">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="font-medium">Daemon rclone no disponible.</span>
      <span className="truncate text-amber-700/80 dark:text-amber-300/80">{message}</span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-6 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
        onClick={() => void refetch()}
        disabled={isFetching}
      >
        <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
        Reintentar
      </Button>
    </div>
  );
}
