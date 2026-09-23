import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  ShieldAlert,
  Clock,
  Fingerprint,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { fetchAnomalies } from '../api/client';

export const Anomalies: React.FC = () => {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchAnomalies();
      setAnomalies(data);
    } catch (err) {
      console.error('Failed to load anomalies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            High Severity
          </span>
        );
      case 'medium':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Medium Severity
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Low Severity
          </span>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'BORDERLINE_LIVENESS':
        return <ShieldAlert className="h-5 w-5 text-red-400" />;
      case 'BORDERLINE_CONFIDENCE':
        return <Fingerprint className="h-5 w-5 text-amber-400" />;
      case 'UNUSUAL_TIME':
        return <Clock className="h-5 w-5 text-blue-400" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <AlertOctagon className="h-6 w-6 text-amber-400" />
            Security & Attendance Anomalies
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Explainable heuristic flags for spoofing attempts, borderline biometrics, and off-hour attendance.
          </p>
        </div>

        <button
          onClick={loadData}
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Refresh anomalies"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="glass-panel p-12 rounded-xl border border-slate-800 text-center">
          <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Auditing attendance logs for behavioral anomalies...</p>
        </div>
      )}

      {!loading && anomalies.length === 0 && (
        <div className="glass-panel p-12 rounded-xl border border-slate-800 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white">System Integrity Optimal</h3>
          <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
            No biometric anomalies, repeated liveness rejections, or unusual scan timestamps detected.
          </p>
        </div>
      )}

      {!loading && anomalies.length > 0 && (
        <div className="space-y-3">
          {anomalies.map((anom, idx) => (
            <div
              key={idx}
              className="glass-panel p-4 rounded-xl border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  {getTypeIcon(anom.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{anom.student_name}</span>
                    <span className="font-mono text-xs text-blue-400">({anom.roll_number})</span>
                    {getSeverityBadge(anom.severity)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{anom.reason}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 whitespace-nowrap pl-12 md:pl-0">
                <span>{anom.date}</span>
                <span>{anom.time}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
