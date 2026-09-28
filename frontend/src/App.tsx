import { lazy, Suspense, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { LiveAttendance } from './pages/LiveAttendance';
import { RegisterStudent } from './pages/RegisterStudent';
import { StudentsList } from './pages/StudentsList';
import { AttendanceRecords } from './pages/AttendanceRecords';
import { Anomalies } from './pages/Anomalies';
import { Timetable } from './pages/Timetable';
import { SelfCheck } from './pages/SelfCheck';
import { fetchHealth } from './api/client';
import { Loading } from './components/ui';
import { useData } from './lib/useData';
import type { Page } from './types';

// Reports pulls in the charting library; load it only when opened
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));

const PAGES: Page[] = ['overview', 'live', 'students', 'register', 'records', 'reports', 'timetable', 'flags', 'self'];

const pageFromHash = (): Page => {
  const hash = window.location.hash.slice(1) as Page;
  return PAGES.includes(hash) ? hash : 'overview';
};

export function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const { data: health } = useData(fetchHealth, [], 15000);

  useEffect(() => {
    const onHash = () => {
      setPage(pageFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="min-h-screen">
      <Sidebar page={page} health={health} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:ml-56 md:py-8 lg:px-10">
        {health && health.database !== 'connected' && (
          <div role="alert" className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Can't reach the server or database. Check that the backend is running.
            {health.details?.error && <span className="block text-xs text-red-700/80">{health.details.error}</span>}
          </div>
        )}
        {page === 'overview' && <Dashboard />}
        {page === 'live' && <LiveAttendance />}
        {page === 'students' && <StudentsList />}
        {page === 'register' && <RegisterStudent />}
        {page === 'records' && <AttendanceRecords />}
        {page === 'reports' && (
          <Suspense fallback={<Loading />}>
            <Analytics />
          </Suspense>
        )}
        {page === 'timetable' && <Timetable />}
        {page === 'flags' && <Anomalies />}
        {page === 'self' && <SelfCheck />}
      </main>
    </div>
  );
}

export default App;
