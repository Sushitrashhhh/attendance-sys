import { lazy, Suspense, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { fetchHealth } from './api/client';
import { Loading } from './components/ui';
import { useData } from './lib/useData';
import type { Page } from './types';

// Lazy-load every page so the initial JS bundle stays small and the app opens faster.
// The Suspense boundary shows a spinner while the chunk is downloading.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const LiveAttendance = lazy(() => import('./pages/LiveAttendance').then((m) => ({ default: m.LiveAttendance })));
const StudentsList = lazy(() => import('./pages/StudentsList').then((m) => ({ default: m.StudentsList })));
const RegisterStudent = lazy(() => import('./pages/RegisterStudent').then((m) => ({ default: m.RegisterStudent })));
const AttendanceRecords = lazy(() => import('./pages/AttendanceRecords').then((m) => ({ default: m.AttendanceRecords })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const Timetable = lazy(() => import('./pages/Timetable').then((m) => ({ default: m.Timetable })));
const Anomalies = lazy(() => import('./pages/Anomalies').then((m) => ({ default: m.Anomalies })));
const SelfCheck = lazy(() => import('./pages/SelfCheck').then((m) => ({ default: m.SelfCheck })));

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
        {page === 'overview' && <Suspense fallback={<Loading />}><Dashboard /></Suspense>}
        {page === 'live' && <Suspense fallback={<Loading />}><LiveAttendance /></Suspense>}
        {page === 'students' && <Suspense fallback={<Loading />}><StudentsList /></Suspense>}
        {page === 'register' && <Suspense fallback={<Loading />}><RegisterStudent /></Suspense>}
        {page === 'records' && <Suspense fallback={<Loading />}><AttendanceRecords /></Suspense>}
        {page === 'reports' && (
          <Suspense fallback={<Loading />}>
            <Analytics />
          </Suspense>
        )}
        {page === 'timetable' && <Suspense fallback={<Loading />}><Timetable /></Suspense>}
        {page === 'flags' && <Suspense fallback={<Loading />}><Anomalies /></Suspense>}
        {page === 'self' && <Suspense fallback={<Loading />}><SelfCheck /></Suspense>}
      </main>
    </div>
  );
}

export default App;
