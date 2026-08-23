import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  RcloneHealth,
  RunWithStats,
  StatsSnapshot,
  WsServerMessage,
} from '@cloudbridge/shared';
import { EMPTY_STATS } from '@cloudbridge/shared';

interface StatsContextValue {
  connected: boolean;
  health: RcloneHealth | null;
  global: StatsSnapshot;
  runs: RunWithStats[];
  /** Live stats for one run, or null when it is not running. */
  runStats: (runId: string) => RunWithStats | null;
}

const StatsContext = createContext<StatsContextValue | null>(null);

const MAX_BACKOFF_MS = 15_000;

/**
 * Subscribes to `/ws/stats`, which pushes a snapshot every second while
 * anything is running. Reconnects with backoff so a daemon restart or a
 * dropped tunnel recovers on its own.
 */
export function StatsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<RcloneHealth | null>(null);
  const [global, setGlobal] = useState<StatsSnapshot>(EMPTY_STATS);
  const [runs, setRuns] = useState<RunWithStats[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/stats`);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== 'string' || event.data === 'pong') return;
        let message: WsServerMessage;
        try {
          message = JSON.parse(event.data) as WsServerMessage;
        } catch {
          return;
        }

        if (message.type === 'stats') {
          setHealth(message.health);
          setGlobal(message.global);
          setRuns(message.runs);
        } else if (message.type === 'run:finished') {
          // A run ending changes the transfers list, the job history and,
          // usually, the contents of the destination panel.
          void queryClient.invalidateQueries({ queryKey: ['transfers'] });
          void queryClient.invalidateQueries({ queryKey: ['jobs'] });
          void queryClient.invalidateQueries({ queryKey: ['fs'] });
          setRuns((previous) => previous.filter((run) => run.id !== message.run.id));
        }
      };

      const scheduleReconnect = () => {
        setConnected(false);
        socketRef.current = null;
        if (closed) return;
        attempt += 1;
        const delay = Math.min(500 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        retry = setTimeout(connect, delay);
      };

      socket.onclose = scheduleReconnect;
      socket.onerror = () => socket.close();
    };

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [queryClient]);

  const value = useMemo<StatsContextValue>(
    () => ({
      connected,
      health,
      global,
      runs,
      runStats: (runId: string) => runs.find((run) => run.id === runId) ?? null,
    }),
    [connected, health, global, runs],
  );

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useStats(): StatsContextValue {
  const context = useContext(StatsContext);
  if (!context) throw new Error('useStats debe usarse dentro de StatsProvider');
  return context;
}
