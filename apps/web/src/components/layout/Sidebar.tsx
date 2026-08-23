import { NavLink } from 'react-router-dom';
import {
  ArrowLeftRight,
  ChevronsLeft,
  ChevronsRight,
  Cloud,
  FolderTree,
  LogOut,
  Moon,
  ScrollText,
  Settings as SettingsIcon,
  Sun,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { RemotesNav } from './RemotesNav';

const NAV = [
  { to: '/explorer', label: 'Explorer', icon: FolderTree },
  { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { to: '/jobs', label: 'Jobs', icon: Timer },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/remotes', label: 'Remotes', icon: Cloud },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-[220px]',
      )}
    >
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        <div className="grid size-6 shrink-0 place-items-center rounded bg-primary/15 text-primary">
          <Cloud className="size-3.5" />
        </div>
        {!collapsed && <span className="text-[13px] font-semibold tracking-tight">CloudBridge</span>}
      </div>

      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Tooltip key={to} disableHoverableContent>
            <TooltipTrigger asChild>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-primary/12 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && label}
              </NavLink>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">{label}</TooltipContent>}
          </Tooltip>
        ))}
      </nav>

      <RemotesNav collapsed={collapsed} />

      <div className="mt-auto flex items-center gap-1 border-t border-border p-2">
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Cambiar tema">
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
        <Tooltip disableHoverableContent>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void logout()}
              aria-label="Cerrar sesión"
            >
              <LogOut />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Cerrar sesión ({user?.username})</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expandir panel lateral' : 'Colapsar panel lateral'}
          className="ml-auto"
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
        </Button>
      </div>
    </aside>
  );
}
