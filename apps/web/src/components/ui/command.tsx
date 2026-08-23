import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Command = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-popover', className)}
    {...props}
  />
));
Command.displayName = 'Command';

export const CommandInput = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center gap-2 border-b border-border px-2.5">
    <Search className="size-3.5 shrink-0 text-muted-foreground" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-8 w-full bg-transparent py-2 text-[13px] outline-none placeholder:text-muted-foreground',
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = 'CommandInput';

export const CommandList = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-64 overflow-y-auto overflow-x-hidden p-1', className)}
    {...props}
  />
));
CommandList.displayName = 'CommandList';

export const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-5 text-center text-xs text-muted-foreground"
    {...props}
  />
));
CommandEmpty.displayName = 'CommandEmpty';

export const CommandGroup = CommandPrimitive.Group;

export const CommandItem = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none',
      'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = 'CommandItem';
