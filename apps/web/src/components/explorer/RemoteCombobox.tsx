import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProviderIcon } from '@/components/provider-icon';
import { cn } from '@/lib/utils';

/** Searchable remote picker for a panel header. */
export function RemoteCombobox({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (remote: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['remotes'], queryFn: api.remotes.list });
  const selected = data?.find((remote) => remote.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn('min-w-40 justify-between', className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {selected && <ProviderIcon type={selected.type} />}
            <span className="truncate">{value ?? 'Elegir remoto'}</span>
          </span>
          <ChevronsUpDown className="ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar remoto…" />
          <CommandList>
            <CommandEmpty>Ningún remoto coincide.</CommandEmpty>
            {data?.map((remote) => (
              <CommandItem
                key={remote.name}
                value={remote.name}
                onSelect={() => {
                  onChange(remote.name);
                  setOpen(false);
                }}
              >
                <ProviderIcon type={remote.type} />
                <span className="truncate">{remote.name}</span>
                <span
                  className={cn(
                    'ml-auto size-1.5 rounded-full',
                    remote.online === null
                      ? 'bg-muted-foreground'
                      : remote.online
                        ? 'bg-emerald-500'
                        : 'bg-red-500',
                  )}
                />
                {value === remote.name && <Check className="size-3.5" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
