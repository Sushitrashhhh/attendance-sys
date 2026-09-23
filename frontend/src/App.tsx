import { useState, useEffect } from 'react';
import { Navbar, type NavTab } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { LiveAttendance } from './pages/LiveAttendance';
import { RegisterStudent } from './pages/RegisterStudent';
import { StudentsList } from './pages/StudentsList';
import { AttendanceRecords } from './pages/AttendanceRecords';
import { Analytics } from './pages/Analytics';
import { Anomalies } from './pages/Anomalies';
import { fetchHealth } from './api/client';
import type { HealthStatus } from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      const data = await fetchHealth();
      if (isMounted) {
        setHealth(data);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-blue-500/30 selection:text-white">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} health={health} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <Dashboard
            health={health}
            onNavigateToLive={() => setActiveTab('live')}
            onNavigateToRegister={() => setActiveTab('register')}
          />
        )}
        {activeTab === 'live' && <LiveAttendance />}
        {activeTab === 'register' && (
          <RegisterStudent onSuccess={() => setActiveTab('students')} />
        )}
        {activeTab === 'students' && (
          <StudentsList onNavigateToRegister={() => setActiveTab('register')} />
        )}
        {activeTab === 'attendance' && <AttendanceRecords />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'anomalies' && <Anomalies />}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AI-Powered Face Recognition Attendance System &bull; Production SaaS</span>
          <span className="text-slate-400">
            FastAPI &bull; React + Vite &bull; OpenCV YuNet &bull; ArcFace (512-D) &bull; Neon pgvector
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
