import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Search,
  Calendar,
  Download,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { fetchAttendance } from '../api/client';
import type { AttendanceRecord } from '../types';

export const AttendanceRecords: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [dateFilter, setDateFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchAttendance({
        date: dateFilter || undefined,
        limit: 100,
      });
      setRecords(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateFilter]);

  // Filter client-side by search term
  const filteredRecords = records.filter((r) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.student_name && r.student_name.toLowerCase().includes(term)) ||
      (r.roll_number && r.roll_number.toLowerCase().includes(term)) ||
      (r.branch && r.branch.toLowerCase().includes(term))
    );
  });

  // Export CSV
  const exportCsv = () => {
    if (filteredRecords.length === 0) return;
    const headers = ['ID', 'Student Name', 'Roll Number', 'Branch', 'Date', 'Time', 'Status', 'Confidence', 'Liveness Score'];
    const rows = filteredRecords.map((r) => [
      r.id,
      `"${r.student_name || ''}"`,
      r.roll_number || '',
      `"${r.branch || ''}"`,
      r.attendance_date,
      r.attendance_time,
      r.status,
      r.confidence,
      r.liveness_score,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_export_${dateFilter || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <ClipboardList className="h-6 w-6 text-blue-400" />
            <span>Attendance History & Audits</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Immutable attendance logs backed by Neon PostgreSQL with exact timestamps and liveness scores.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
          <button
            onClick={exportCsv}
            disabled={filteredRecords.length === 0}
            className={`inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              filteredRecords.length > 0
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel rounded-xl p-4 border border-slate-800 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by student name or roll number..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Calendar className="h-3.5 w-3.5 text-blue-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-xs text-white"
            />
          </div>
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="text-xs text-slate-400 hover:text-white px-2 py-1.5 rounded bg-slate-800"
            >
              All Dates
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
            Loading attendance records from Neon...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ClipboardList className="h-12 w-12 mx-auto text-slate-600" />
            <h3 className="text-base font-semibold text-white">No Attendance Records Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {dateFilter || searchTerm
                ? 'No records match your selected filters. Try adjusting the search or date.'
                : 'Verified facial attendance check-ins will populate this ledger with timestamps and confidence scores.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">Roll Number</th>
                  <th className="px-6 py-4">Branch</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Confidence</th>
                  <th className="px-6 py-4">Liveness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-white">
                      {r.student_name || `Student #${r.student_id}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-blue-400 font-semibold">
                      {r.roll_number || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                      {r.branch || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-400 font-mono text-xs">
                      {r.attendance_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-400 font-mono text-xs">
                      {r.attendance_time}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Present
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-300">
                      <span className="font-mono">{Math.round(r.confidence * 100)}%</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono bg-slate-900 border border-slate-800 text-emerald-400">
                        <ShieldCheck className="h-3 w-3" />
                        {Math.round(r.liveness_score * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-3 bg-slate-900/50 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
          <span>Showing {filteredRecords.length} of {total} records</span>
          <span>Constraint enforced: UNIQUE(student_id, attendance_date)</span>
        </div>
      </div>
    </div>
  );
};
