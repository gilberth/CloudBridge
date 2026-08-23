import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import LoginPage from '@/pages/Login';
import ExplorerPage from '@/pages/Explorer';
import TransfersPage from '@/pages/Transfers';
import JobsPage from '@/pages/Jobs';
import LogsPage from '@/pages/Logs';
import RemotesPage from '@/pages/Remotes';
import SettingsPage from '@/pages/Settings';

export function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <BootSkeleton />;
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/explorer" replace />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/remotes" element={<RemotesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/explorer" replace />} />
      </Route>
    </Routes>
  );
}

/** Shown while the session is being resolved — never a full-screen spinner. */
function BootSkeleton() {
  return (
    <div className="flex h-dvh">
      <div className="w-[220px] shrink-0 space-y-2 border-r border-border bg-sidebar p-3">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-1 pt-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
