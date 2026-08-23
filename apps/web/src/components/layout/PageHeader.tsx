import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex h-11 shrink-0 items-center gap-3 border-b border-border px-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[13px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="truncate text-[11px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}
