import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Award,
} from 'lucide-react';
import { fetchAnalyticsOverview, fetchAnalyticsTrends } from '../api/client';
import type { AnalyticsOverview } from '../types';

export const Analytics: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [trends, setTrends] = useState<{ date: string; day: string; present: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ovData, trData] = await Promise.all([
        fetchAnalyticsOverview(),
        fetchAnalyticsTrends(days),
      ]);
      setOverview(ovData);
      setTrends(trData);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [days]);

  const maxPresent = Math.max(...trends.map((t) => t.present), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-400" />
            Attendance Analytics & Trends
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time analytics aggregated directly from PostgreSQL attendance records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-medium">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  days === d
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>

          <button
            onClick={loadData}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Refresh analytics"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Total Enrolled
            </span>
            <div className="text-2xl font-bold text-white mt-1">
              {overview?.total_students ?? 0}
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Active biometric profiles</span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="h-6 w-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Present Today
            </span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {overview?.present_today ?? 0}
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Verified through camera</span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Absent Today
            </span>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {overview?.absent_today ?? 0}
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Remaining unenrolled / unverified</span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <XCircle className="h-6 w-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Attendance Rate
            </span>
            <div className="text-2xl font-bold text-cyan-400 mt-1">
              {overview?.attendance_rate ?? 0}%
            </div>
            <span className="text-xs text-slate-500 mt-1 block">Daily participation index</span>
          </div>
          <div className="h-12 w-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Award className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main Trend Chart */}
      <div className="glass-panel p-6 rounded-xl border border-slate-800 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              Daily Attendance Trends ({days} Days)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified daily student presence over calendar days.
            </p>
          </div>
        </div>

        {/* Custom Visual Bar Chart */}
        <div className="h-64 flex items-end gap-2 pt-6 pb-2 border-b border-slate-800">
          {trends.map((t, idx) => {
            const heightPercent = Math.max(8, (t.present / maxPresent) * 100);
            return (
              <div
                key={idx}
                className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end"
              >
                {/* Tooltip */}
                <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 border border-slate-700 px-2 py-1 rounded text-[11px] text-white whitespace-nowrap z-10 pointer-events-none shadow-lg">
                  {t.date}: <span className="text-emerald-400 font-bold">{t.present} Present</span>
                </div>

                {/* Bar */}
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full rounded-t-md transition-all duration-300 ${
                    t.present > 0
                      ? 'bg-gradient-to-t from-blue-600 to-indigo-500 group-hover:from-blue-500 group-hover:to-cyan-400'
                      : 'bg-slate-800/60'
                  }`}
                />

                {/* Date Label */}
                <span className="text-[10px] text-slate-400 group-hover:text-white font-mono">
                  {t.day}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Scale: 0 to {maxPresent} attendees</span>
          <span>Source: Neon PostgreSQL Unique Attendance Table</span>
        </div>
      </div>
    </div>
  );
};
