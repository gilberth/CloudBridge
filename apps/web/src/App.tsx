import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import ExplorerPage from '@/pages/Explorer';
import TransfersPage from '@/pages/Transfers';
import JobsPage from '@/pages/Jobs';
import LogsPage from '@/pages/Logs';
import RemotesPage from '@/pages/Remotes';
import SettingsPage from '@/pages/Settings';

export function App() {
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
