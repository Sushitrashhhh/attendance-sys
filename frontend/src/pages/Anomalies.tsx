import { useState } from 'react';
import { deleteAttendance, dismissFailedChecks, fetchAnomalies } from '../api/client';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, button } from '../components/ui';
import { fmtDate, fmtTime } from '../lib/format';
import { useData } from '../lib/useData';
import type { Anomaly } from '../types';

const KIND: Record<Anomaly['type'], { label: string; tone: string }> = {
  REPEATED_FAILED_CHECKS: { label: 'Possible proxy attempt', tone: 'bg-red-600 text-white' },
  BORDERLINE_LIVENESS: { label: 'Weak liveness', tone: 'bg-red-50 text-red-800' },
  BORDERLINE_CONFIDENCE: { label: 'Low match confidence', tone: 'bg-amber-50 text-amber-800' },
  UNUSUAL_TIME: { label: 'Outside 7am–6pm', tone: 'bg-stone-100 text-stone-700' },
};

export function Anomalies() {
  const { data, error, reload } = useData(fetchAnomalies, []);
  const [actionError, setActionError] = useState<string | null>(null);

  const dismiss = async (a: Anomaly) => {
    setActionError(null);
    try {
      await dismissFailedChecks(a.student_id, a.date);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not dismiss.');
    }
  };

  const remove = async (a: Anomaly) => {
    if (a.record_id === null) return;
    if (!window.confirm(`Remove ${a.student_name}'s attendance on ${fmtDate(a.date)}? They will be marked absent for that day.`)) return;
    setActionError(null);
    try {
      await deleteAttendance(a.record_id);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not remove the record.');
    }
  };

  return (
    <>
      <PageHeader
        title="Flagged scans"
        subtitle="Camera check-ins worth a second look. If one looks wrong (say, a photo held up to the camera), remove it."
      />
      {(error || actionError) && <ErrorNote message={(error || actionError)!} />}

      <Card>
        {!data ? (
          <Loading />
        ) : data.length === 0 ? (
          <EmptyState>Nothing flagged. Manual marks are never flagged.</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {data.map((a) => {
              return (
                <li key={`${a.type}-${a.record_id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className={`w-fit shrink-0 rounded px-2 py-0.5 text-xs font-medium ${KIND[a.type]?.tone ?? ''}`}>
                    {KIND[a.type]?.label ?? a.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{a.student_name}</span>
                      <span className="ml-2 font-mono text-xs text-stone-500">{a.roll_number}</span>
                    </div>
                    <div className="text-xs text-stone-500">{a.reason}</div>
                  </div>
                  <div className="shrink-0 text-xs text-stone-500">
                    {fmtDate(a.date)} · {fmtTime(a.time)}
                  </div>
                  {a.record_id === null ? (
                    <button className={`${button.small} shrink-0 text-stone-500 hover:bg-stone-100`} onClick={() => dismiss(a)}>
                      Dismiss
                    </button>
                  ) : (
                    <button className={`${button.small} shrink-0 text-stone-500 hover:bg-red-50 hover:text-red-700`} onClick={() => remove(a)}>
                      Remove check-in
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
