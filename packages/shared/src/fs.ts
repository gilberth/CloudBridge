/** Normalised view of an `operations/list` entry. */
export interface FsEntry {
  /** Path relative to the listed directory, as returned by rclone. */
  path: string;
  name: string;
  size: number;
  mimeType: string;
  /** ISO-8601. */
  modTime: string;
  isDir: boolean;
  hashes?: Record<string, string>;
}

export interface FsListing {
  remote: string;
  path: string;
  entries: FsEntry[];
}

export interface RemotePath {
  remote: string;
  path: string;
}

/**
 * Comparison buckets rendered by the Explorer.
 * - `onlySrc`    (green) present only on the left/source side
 * - `onlyDst`    (blue)  present only on the right/destination side
 * - `differ`     (amber) same name, different size and/or modification time
 * - `identical`  (grey)  same name, same size and modification time
 */
export type CompareCategory = 'onlySrc' | 'onlyDst' | 'differ' | 'identical';

export const COMPARE_CATEGORIES: CompareCategory[] = [
  'onlySrc',
  'onlyDst',
  'differ',
  'identical',
];

export interface CompareRow {
  name: string;
  isDir: boolean;
  category: CompareCategory;
  src?: FsEntry;
  dst?: FsEntry;
  /** Populated when the deep (hash) comparison ran and disagreed with size/mtime. */
  hashMismatch?: boolean;
}

export interface CompareResult {
  source: RemotePath;
  destination: RemotePath;
  deep: boolean;
  rows: CompareRow[];
  counts: Record<CompareCategory, number>;
}

export interface SizeResult {
  count: number;
  bytes: number;
}
