import React from 'react';
import { BarChart3, CalendarDays, Camera, Flag, LayoutGrid, ListChecks, UserSearch, Users } from 'lucide-react';
import type { HealthStatus, Page } from '../types';

const NAV: { id: Page; label: string; icon: React.ReactNode; also?: Page[] }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'live', label: 'Take attendance', icon: <Camera className="h-4 w-4" /> },
  { id: 'students', label: 'Students', icon: <Users className="h-4 w-4" />, also: ['register'] },
  { id: 'records', label: 'Records', icon: <ListChecks className="h-4 w-4" /> },
  { id: 'reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'timetable', label: 'Timetable', icon: <CalendarDays className="h-4 w-4" /> },
  { id: 'flags', label: 'Flagged scans', icon: <Flag className="h-4 w-4" /> },
  { id: 'self', label: 'Student self-check', icon: <UserSearch className="h-4 w-4" /> },
];

export function Sidebar({ page, health }: { page: Page; health: HealthStatus | null }) {
  const dbOk = health?.database === 'connected';

  return (
    <aside className="border-b border-stone-200 bg-white md:fixed md:inset-y-0 md:left-0 md:flex md:w-56 md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-4 py-4 md:px-5 md:py-5">
        <img src="/favicon.svg" alt="" className="h-6 w-6" />
        <span className="font-semibold tracking-tight">FacePulse</span>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-visible md:px-3 md:pb-0">
        {NAV.map((item) => {
          const active = item.id === page || item.also?.includes(page);
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active ? 'bg-stone-100 font-medium text-stone-900' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
              }`}
            >
              <span className={active ? 'text-accent' : 'text-stone-400'}>{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </nav>

      <div
        className="hidden items-center gap-2 border-t border-stone-200 px-5 py-3 text-xs text-stone-500 md:flex"
        title={dbOk ? undefined : health?.details?.error}
      >
        <span className={`h-2 w-2 rounded-full ${health === null ? 'bg-stone-300' : dbOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {health === null ? 'Checking server…' : dbOk ? 'Server connected' : 'Server unreachable'}
      </div>
    </aside>
  );
}
