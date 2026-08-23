import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type PanelSide = 'left' | 'right';

export interface PanelState {
  remote: string | null;
  path: string;
  setRemote: (remote: string | null) => void;
  setPath: (path: string) => void;
  navigate: (remote: string | null, path: string) => void;
}

/**
 * Panel location lives in the URL, so a two-pane view can be bookmarked and the
 * sidebar can deep-link into a remote.
 */
export function usePanelState(side: PanelSide): PanelState {
  const [searchParams, setSearchParams] = useSearchParams();
  const remoteKey = side;
  const pathKey = `${side}Path`;

  const remote = searchParams.get(remoteKey);
  const path = searchParams.get(pathKey) ?? '';

  const navigate = useCallback(
    (nextRemote: string | null, nextPath: string) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (nextRemote) next.set(remoteKey, nextRemote);
          else next.delete(remoteKey);
          if (nextPath) next.set(pathKey, nextPath);
          else next.delete(pathKey);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, remoteKey, pathKey],
  );

  const setRemote = useCallback(
    (nextRemote: string | null) => navigate(nextRemote, ''),
    [navigate],
  );
  const setPath = useCallback((nextPath: string) => navigate(remote, nextPath), [navigate, remote]);

  return useMemo(
    () => ({ remote, path, setRemote, setPath, navigate }),
    [remote, path, setRemote, setPath, navigate],
  );
}

/** Split a remote path into breadcrumb segments. */
export function pathSegments(path: string): { label: string; path: string }[] {
  const absolute = path.startsWith('/');
  const parts = path.split('/').filter(Boolean);
  return parts.map((label, index) => ({
    label,
    path: `${absolute ? '/' : ''}${parts.slice(0, index + 1).join('/')}`,
  }));
}

export function parentOf(path: string): string {
  const absolute = path.startsWith('/');
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  if (parts.length === 0) return absolute ? '/' : '';
  return `${absolute ? '/' : ''}${parts.join('/')}`;
}

export function childPath(path: string, name: string): string {
  if (!path) return name;
  return path.endsWith('/') ? `${path}${name}` : `${path}/${name}`;
}
