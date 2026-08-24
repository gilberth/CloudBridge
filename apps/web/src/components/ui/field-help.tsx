import { useId } from 'react';
import { CircleHelp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function FieldHelp({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const helpId = useId();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Información sobre ${label}`}
          aria-describedby={helpId}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        id={helpId}
        side="top"
        className="max-w-72 text-pretty leading-relaxed"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
