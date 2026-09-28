import React, { useState } from 'react';
import { fetchSelfCheck } from '../api/client';
import { Card, EmptyState, ErrorNote, LateTag, PageHeader, button, table } from '../components/ui';
import { fmtDate, fmtTime, outlookText } from '../lib/format';
import type { AttendanceSummary, SelfCheck as SelfCheckData } from '../types';

function Percent({ summary, target, big = false }: { summary: AttendanceSummary; target: number; big?: boolean }) {
  if (summary.percentage === null) return <span className="text-stone-400">–</span>;
  const low = summary.percentage < target;
  return (
    <span className={`tabular-nums ${big ? 'text-3xl font-semibold' : 'font-medium'} ${low ? 'text-red-700' : ''}`}>
      {summary.percentage}%
    </span>
  );
}

export function SelfCheck() {
  const [roll, setRoll] = useState('');
  const [data, setData] = useState<SelfCheckData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSelfCheck(roll));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Could not look that up.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Student self-check" subtitle="Students: enter your roll number to see your attendance and how many classes you can still miss." />

      <form onSubmit={check} className="mb-6 flex flex-wrap gap-2">
        <input
          type="text"
          required
          maxLength={50}
          value={roll}
          onChange={(e) => setRoll(e.target.value)}
          placeholder="Roll number"
          aria-label="Roll number"
          className="w-60 font-mono uppercase"
          autoComplete="off"
        />
        <button type="submit" className={button.primary} disabled={loading || !roll.trim()}>
          {loading ? 'Checking…' : 'Check'}
        </button>
        {data && (
          <button
            type="button"
            className={button.secondary}
            onClick={() => {
              setData(null);
              setRoll('');
            }}
          >
            Clear
          </button>
        )}
      </form>

      {error && <ErrorNote message={error} />}

      {data && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-semibold">{data.student.name}</div>
                <div className="text-sm text-stone-500">
                  <span className="font-mono">{data.student.roll_number}</span> · {data.student.branch} · Sem {data.student.semester}
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-sm text-stone-500">Overall attendance</div>
                <Percent summary={data.overall} target={data.target} big />
                <div className="text-sm text-stone-500">
                  {data.overall.present_days} of {data.overall.total_days} class days
                  {data.overall.excused_days > 0 && ` · ${data.overall.excused_days} excused`}
                </div>
              </div>
            </div>
            <p
              className={`mt-4 rounded-md px-3 py-2 text-sm ${
                data.overall.outlook && 'must_attend' in data.overall.outlook ? 'bg-red-50 text-red-900' : 'bg-stone-50 text-stone-700'
              }`}
            >
              {outlookText(data.overall.outlook, data.target)}
            </p>
          </Card>

          <Card title="By subject">
            {data.subjects.length === 0 ? (
              <EmptyState>No timetable subjects for your class yet.</EmptyState>
            ) : (
              <div className={table.wrap}>
                <table className={table.el}>
                  <thead>
                    <tr>
                      <th className={table.th}>Subject</th>
                      <th className={`${table.th} text-right`}>Attended</th>
                      <th className={`${table.th} text-right`}>Late</th>
                      <th className={`${table.th} text-right`}>Attendance</th>
                      <th className={table.th}>What it means</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subjects.map((s) => (
                      <tr key={s.subject}>
                        <td className={`${table.td} font-medium`}>{s.subject}</td>
                        <td className={`${table.td} text-right tabular-nums`}>
                          {s.present_days} / {s.total_days}
                        </td>
                        <td className={`${table.td} text-right tabular-nums text-stone-600`}>{s.late_days || '–'}</td>
                        <td className={`${table.td} text-right`}>
                          <Percent summary={s} target={data.target} />
                        </td>
                        <td className={`${table.td} text-stone-600`}>{outlookText(s.outlook, data.target)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Recent check-ins">
            {data.recent.length === 0 ? (
              <EmptyState>No check-ins yet.</EmptyState>
            ) : (
              <ul className="divide-y divide-stone-100">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>
                      {fmtDate(r.attendance_date, { weekday: 'short', day: 'numeric', month: 'short' })}
                      <span className="text-stone-500"> · {r.lecture_subject ?? 'Whole day'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <LateTag status={r.status} />
                      <span className="font-mono text-xs text-stone-500">{fmtTime(r.attendance_time)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
