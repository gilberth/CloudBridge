import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Polls `/api/health`. Drives the "rclone daemon caído" banner, which disables
 * every action instead of letting calls fail one by one.
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 15_000,
    retry: false,
    staleTime: 5_000,
  });
}
