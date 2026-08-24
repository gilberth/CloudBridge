import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type PanelSide = 'left' | 'right';

export interface PanelState {
  remote: string | null;
  path: string;
  setRemote: (remote: string | null) => void;
  setPath: (path: string) => void;
  navigate: (remote: string | null, path: string) => void;
}

const remoteStorageKey = (side: PanelSide) => `cloudbridge.explorer.${side}Remote`;

function readStoredRemote(side: PanelSide): string | null {
  try {
    return window.localStorage.getItem(remoteStorageKey(side));
  } catch {
    return null;
  }
}

function storeRemote(side: PanelSide, remote: string | null) {
  try {
    if (remote) window.localStorage.setItem(remoteStorageKey(side), remote);
    else window.localStorage.removeItem(remoteStorageKey(side));
  } catch {
    // The URL remains the source of truth when storage is unavailable.
  }
}

/**
 * Panel location lives in the URL, so a two-pane view can be bookmarked and the
 * sidebar can deep-link into a remote.
 */
export function usePanelState(
  side: PanelSide,
  availableRemotes?: readonly string[],
): PanelState {
  const [searchParams, setSearchParams] = useSearchParams();
  const remoteKey = side;
  const pathKey = `${side}Path`;

  const urlRemote = searchParams.get(remoteKey);
  const storedRemote = readStoredRemote(side);
  const candidateRemote = urlRemote ?? storedRemote;
  const remote =
    candidateRemote &&
    (availableRemotes === undefined || availableRemotes.includes(candidateRemote))
      ? candidateRemote
      : null;
  const path = searchParams.get(pathKey) ?? '';

  const navigate = useCallback(
    (nextRemote: string | null, nextPath: string) => {
      storeRemote(side, nextRemote);
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
    [setSearchParams, side, remoteKey, pathKey],
  );

  useEffect(() => {
    if (availableRemotes === undefined || !candidateRemote) return;

    if (!availableRemotes.includes(candidateRemote)) {
      navigate(null, '');
      return;
    }

    storeRemote(side, candidateRemote);
    if (!urlRemote) navigate(candidateRemote, '');
  }, [availableRemotes, candidateRemote, navigate, side, urlRemote]);

  const setRemote = useCallback(
    (nextRemote: string | null) => navigate(nextRemote, ''),
    [navigate],
  );
  const setPath = useCallback(
    (nextPath: string) => navigate(remote, nextPath),
    [navigate, remote],
  );

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
