import type { FastifyInstance } from 'fastify';
import type {
  CompareCategory,
  CompareResult,
  CompareRow,
  FsCompareInput,
  FsEntry,
  FsListing,
  SizeResult,
} from '@cloudbridge/shared';
import { badRequest, notFound } from '../lib/errors.js';
import {
  baseName,
  isRootPath,
  joinPath,
  parentPath,
  sanitizeName,
  sanitizePath,
  sanitizeRemoteName,
} from '../lib/path.js';
import { fsAndRemote, fsPath } from '../rclone/fsstring.js';
import type { RcListItem } from '../rclone/types.js';

export interface DeleteEntry {
  path: string;
  isDir: boolean;
}

/** File-system operations on top of the rclone `operations/*` endpoints. */
export class FsService {
  constructor(private readonly app: FastifyInstance) {}

  private get rclone() {
    return this.app.rclone;
  }

  /** Reject unknown remotes before building any `remote:path` string. */
  private async assertRemote(remote: string): Promise<string> {
    const name = sanitizeRemoteName(remote);
    const known = await this.rclone.listRemotes();
    if (!known.includes(name)) throw notFound(`El remoto "${name}" no existe`);
    return name;
  }

  private normalise(item: RcListItem): FsEntry {
    return {
      path: item.Path,
      name: item.Name,
      size: item.IsDir ? -1 : item.Size,
      mimeType: item.MimeType ?? '',
      modTime: item.ModTime,
      isDir: item.IsDir,
      ...(item.Hashes ? { hashes: item.Hashes } : {}),
    };
  }

  async list(remote: string, path: string, recurse = false): Promise<FsListing> {
    const name = await this.assertRemote(remote);
    const clean = sanitizePath(path);
    // The full path goes in `fs` with an empty `remote`: `local` remotes resolve
    // a bare `disco:` against rclone's working directory, so splitting the path
    // between the two arguments only works for backends with a fixed root.
    const items = await this.rclone.list(fsPath(name, clean), '', { recurse, noMimeType: false });

    const entries = items.map((item) => this.normalise(item)).sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' });
    });

    return { remote: name, path: clean, entries };
  }

  async mkdir(remote: string, path: string): Promise<void> {
    const name = await this.assertRemote(remote);
    const clean = sanitizePath(path);
    if (isRootPath(clean)) throw badRequest('Falta la ruta de la carpeta');
    const { fs, remote: leaf } = fsAndRemote(name, clean);
    await this.rclone.mkdir(fs, leaf);
  }

  async remove(remote: string, entries: DeleteEntry[]): Promise<void> {
    const name = await this.assertRemote(remote);
    for (const entry of entries) {
      const clean = sanitizePath(entry.path);
      if (isRootPath(clean)) throw badRequest('No se puede borrar la raíz del remoto');
      const { fs, remote: leaf } = fsAndRemote(name, clean);
      if (entry.isDir) {
        await this.rclone.purge(fs, leaf);
      } else {
        await this.rclone.deleteFile(fs, leaf);
      }
    }
  }

  /**
   * rclone has no "rename" endpoint. Files use `operations/movefile`;
   * directories are moved with `sync/move`, which also removes the now-empty
   * source directory.
   */
  async rename(remote: string, from: string, to: string, isDir: boolean): Promise<void> {
    const name = await this.assertRemote(remote);
    const source = sanitizePath(from);
    const target = sanitizePath(to);
    if (isRootPath(source) || isRootPath(target)) {
      throw badRequest('No se puede renombrar la raíz del remoto');
    }
    if (source === target) return;

    if (isDir) {
      const jobId = await this.rclone.syncMove(fsPath(name, source), fsPath(name, target), {
        createEmptySrcDirs: false,
        deleteEmptySrcDirs: true,
      });
      await this.waitForJob(jobId);
      return;
    }

    const src = fsAndRemote(name, source);
    const dst = fsAndRemote(name, target);
    const jobId = await this.rclone.moveFile(src.fs, src.remote, dst.fs, dst.remote);
    await this.waitForJob(jobId);
  }

  /** Rename an entry in place, keeping it in the same directory. */
  renameInPlace(remote: string, path: string, newName: string, isDir: boolean): Promise<void> {
    const clean = sanitizePath(path);
    const target = joinPath(parentPath(clean), sanitizeName(newName));
    return this.rename(remote, clean, target, isDir);
  }

  async size(remote: string, path: string): Promise<SizeResult> {
    const name = await this.assertRemote(remote);
    return this.rclone.size(fsPath(name, sanitizePath(path)));
  }

  /**
   * Compare two directories and bucket every entry into one of four
   * categories, which the Explorer renders as colours.
   *
   * The default pass diffs two `operations/list` results by name, size and
   * modification time — it is fast and gives the UI per-row metadata. The deep
   * pass additionally runs `operations/check`, which compares hashes (and with
   * `download` set, the bytes themselves) and can therefore catch a file that
   * has the same size and timestamp but different content.
   */
  async compare(input: FsCompareInput): Promise<CompareResult> {
    const [source, destination] = await Promise.all([
      this.list(input.source.remote, input.source.path, input.recurse),
      this.list(input.destination.remote, input.destination.path, input.recurse),
    ]);

    const byPath = new Map<string, { src?: FsEntry; dst?: FsEntry }>();
    for (const entry of source.entries) byPath.set(entry.path, { src: entry });
    for (const entry of destination.entries) {
      const existing = byPath.get(entry.path);
      if (existing) existing.dst = entry;
      else byPath.set(entry.path, { dst: entry });
    }

    let differing = new Set<string>();
    if (input.deep) {
      differing = await this.deepDiff(input);
    }

    const rows: CompareRow[] = [];
    for (const [path, pair] of byPath) {
      const entry = pair.src ?? pair.dst!;
      let category: CompareCategory;
      if (pair.src && !pair.dst) category = 'onlySrc';
      else if (!pair.src && pair.dst) category = 'onlyDst';
      else if (entry.isDir) category = 'identical';
      else category = this.sameContent(pair.src!, pair.dst!) ? 'identical' : 'differ';

      const hashMismatch = differing.has(path);
      if (hashMismatch && category === 'identical') category = 'differ';

      rows.push({
        name: entry.name,
        isDir: entry.isDir,
        category,
        ...(pair.src ? { src: pair.src } : {}),
        ...(pair.dst ? { dst: pair.dst } : {}),
        ...(hashMismatch ? { hashMismatch } : {}),
      });
    }

    rows.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' });
    });

    const counts: Record<CompareCategory, number> = {
      onlySrc: 0,
      onlyDst: 0,
      differ: 0,
      identical: 0,
    };
    for (const row of rows) counts[row.category] += 1;

    return {
      source: { remote: source.remote, path: source.path },
      destination: { remote: destination.remote, path: destination.path },
      deep: input.deep,
      rows,
      counts,
    };
  }

  /** Same size and same modification time (to the second). */
  private sameContent(a: FsEntry, b: FsEntry): boolean {
    if (a.size !== b.size) return false;
    const left = new Date(a.modTime).getTime();
    const right = new Date(b.modTime).getTime();
    if (Number.isNaN(left) || Number.isNaN(right)) return true;
    return Math.abs(left - right) < 1000;
  }

  /** Paths rclone's own checker reports as different. */
  private async deepDiff(input: FsCompareInput): Promise<Set<string>> {
    const srcFs = fsPath(input.source.remote, input.source.path);
    const dstFs = fsPath(input.destination.remote, input.destination.path);
    const result = await this.rclone.check(srcFs, dstFs, { download: input.download });
    return new Set(result.differ ?? []);
  }

  /**
   * Wait for a short-lived rclone job (rename/move of a single entry). Long
   * transfers are tracked as runs instead of blocked on.
   */
  private async waitForJob(jobId: number, timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.rclone.jobStatus(jobId);
      if (status.finished) {
        if (!status.success) throw badRequest(status.error || 'La operación falló en rclone');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw badRequest('La operación tardó demasiado; sigue en curso en rclone');
  }

  /**
   * Stream a single object out of rclone. The daemon runs with `--rc-serve`,
   * which exposes remote objects at `/[remote:path]`.
   */
  async download(
    remote: string,
    path: string,
  ): Promise<{ body: ReadableStream<Uint8Array>; contentType: string; contentLength: string | null; filename: string }> {
    const name = await this.assertRemote(remote);
    const clean = sanitizePath(path);
    if (isRootPath(clean)) throw badRequest('Falta la ruta del archivo');

    const connection = this.app.settings.connection();
    const { fs, remote: leaf } = fsAndRemote(name, clean);

    // `--rc-serve` exposes objects at /[<fs>]/<object>, with the brackets and the
    // remote's colon written literally. Only the individual segments are encoded.
    const [prefix, ...rest] = fs.split(':');
    const directory = rest
      .join(':')
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const url = `${connection.url.replace(/\/+$/, '')}/[${encodeURIComponent(prefix ?? name)}:${directory}]/${encodeURIComponent(leaf)}`;

    const response = await fetch(url, {
      headers: {
        authorization: `Basic ${Buffer.from(`${connection.user}:${connection.password}`).toString('base64')}`,
      },
    });

    if (!response.ok || !response.body) {
      throw notFound(`No se pudo descargar "${clean}" (${response.status})`);
    }

    return {
      body: response.body,
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      contentLength: response.headers.get('content-length'),
      filename: baseName(clean),
    };
  }
}
