import { cn } from '@/lib/utils';

/** Loading placeholder. The app never shows a full-screen spinner. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export function TableSkeleton({ rows = 8, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn('h-5', columnIndex === 0 ? 'flex-1' : 'w-20')}
              style={{ animationDelay: `${(rowIndex * columns + columnIndex) * 20}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
