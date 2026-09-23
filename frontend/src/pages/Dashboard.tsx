import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Percent,
  Shield,
  Cpu,
  Database,
  Activity,
  ArrowUpRight,
  RefreshCw,
  Clock,
} from 'lucide-react';
import type { HealthStatus, AnalyticsOverview, AttendanceRecord } from '../types';
import { fetchAnalyticsOverview, fetchTodayAttendance } from '../api/client';

interface DashboardProps {
  health: HealthStatus | null;
  onNavigateToLive: () => void;
  onNavigateToRegister: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  health,
  onNavigateToLive,
  onNavigateToRegister,
}) => {
  const isDbConnected = health?.database === 'connected';
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMetrics = async () => {
    try {
      const [ov, att] = await Promise.all([
        fetchAnalyticsOverview(),
        fetchTodayAttendance(),
      ]);
      setOverview(ov);
      setRecentAttendance(att.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 12000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl glass-panel p-8 border border-slate-800 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-blue-950/40">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Shield className="h-3.5 w-3.5" />
            <span>AI Computer Vision + pgvector Attendance Engine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Real-Time Face Recognition Attendance
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            High-precision ArcFace 512-dim facial embeddings, OpenCV YuNet detection,
            multi-factor anti-spoofing liveness verification, and instant similarity search hosted on Neon PostgreSQL.
          </p>

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={onNavigateToLive}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/20"
            >
              <span>Launch Live Camera</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
            <button
              onClick={onNavigateToRegister}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-slate-700 transition-all"
            >
              <span>Register Student</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="glass-panel rounded-xl p-5 border border-slate-800/80 hover:border-slate-700/80 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Enrolled
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold text-white">
              {overview?.total_students ?? 0}
            </span>
            <span className="ml-2 text-xs text-slate-400">students</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Registered biometric profiles</p>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-slate-800/80 hover:border-slate-700/80 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Present Today
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <UserCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold text-emerald-400">
              {overview?.present_today ?? 0}
            </span>
            <span className="ml-2 text-xs text-slate-400">verified</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Unique daily attendance marks</p>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-slate-800/80 hover:border-slate-700/80 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Absent Today
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <UserX className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold text-amber-400">
              {overview?.absent_today ?? 0}
            </span>
            <span className="ml-2 text-xs text-slate-400">unmarked</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Awaiting attendance</p>
        </div>

        <div className="glass-panel rounded-xl p-5 border border-slate-800/80 hover:border-slate-700/80 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Attendance Rate
            </span>
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Percent className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold text-cyan-400">
              {overview?.attendance_rate ?? 0.0}%
            </span>
            <span className="ml-2 text-xs text-slate-400">today</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Daily verification index</p>
        </div>
      </div>

      {/* System Health & Architecture Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-xl p-6 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Activity className="h-5 w-5 text-blue-400" />
              <span>Vision Architecture & Live Telemetry</span>
            </h2>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Production Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center space-x-2 text-xs font-medium text-slate-400">
                <Cpu className="h-4 w-4 text-cyan-400" />
                <span>Face Model</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">ArcFace (512-dim)</p>
              <p className="text-xs text-slate-400">ResNet-50 L2-normalized</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center space-x-2 text-xs font-medium text-slate-400">
                <Shield className="h-4 w-4 text-emerald-400" />
                <span>Detection Engine</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">OpenCV YuNet</p>
              <p className="text-xs text-slate-400">5-point affine alignment</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center space-x-2 text-xs font-medium text-slate-400">
                <Database className="h-4 w-4 text-purple-400" />
                <span>Neon Vector Store</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">
                {isDbConnected ? 'Connected & Ready' : 'Awaiting Connection'}
              </p>
              <p className="text-xs text-slate-400">Cosine Distance (&lt;=&gt;)</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-900/30 text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-blue-300">Architecture Guarantee:</p>
            <p className="text-slate-400">
              Attendance records are strictly protected by a relational constraint{' '}
              <code className="text-blue-400 font-mono">UNIQUE(student_id, attendance_date)</code> in
              Neon PostgreSQL, preventing duplicate check-ins on the same calendar day. Biometric embeddings
              are kept server-side only and never exposed in browser responses.
            </p>
          </div>
        </div>

        {/* Live Diagnostics & Recent Activity Card */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <span>Recent Activity</span>
            </h2>
            <button onClick={loadMetrics} className="text-slate-400 hover:text-white">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {recentAttendance.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No check-ins recorded yet today.
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {recentAttendance.map((rec) => (
                <div
                  key={rec.id}
                  className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-white block">{rec.student_name}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {rec.roll_number} &bull; {rec.attendance_time}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {Math.round(rec.confidence * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
