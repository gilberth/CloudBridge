import { ChevronRight, HardDrive } from 'lucide-react';
import { pathSegments } from '@/hooks/usePanelState';
import { cn } from '@/lib/utils';

/** Clickable breadcrumb for the current directory. */
export function PathBreadcrumb({
  remote,
  path,
  onNavigate,
  className,
}: {
  remote: string;
  path: string;
  onNavigate: (path: string) => void;
  className?: string;
}) {
  const segments = pathSegments(path);
  const rootPath = path.startsWith('/') ? '/' : '';

  return (
    <nav
      aria-label="Ruta"
      className={cn('mono flex min-w-0 items-center gap-0.5 overflow-x-auto text-[12px]', className)}
    >
      <button
        type="button"
        onClick={() => onNavigate(rootPath)}
        className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <HardDrive className="size-3" />
        {remote}
      </button>
      {segments.map((segment, index) => (
        <span key={segment.path} className="flex shrink-0 items-center">
          <ChevronRight className="size-3 text-muted-foreground/50" />
          <button
            type="button"
            onClick={() => onNavigate(segment.path)}
            className={cn(
              'rounded px-1 py-0.5 hover:bg-accent',
              index === segments.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {segment.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
