import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchStudentReport, fetchTrends } from '../api/client';
import { LecturePicker } from '../components/LecturePicker';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, table } from '../components/ui';
import { useLectureChoice } from '../lib/useLectureChoice';
import { LOW_ATTENDANCE } from '../lib/constants';
import { fmtDate } from '../lib/format';
import { useData } from '../lib/useData';
import type { TrendPoint } from '../types';


const RANGES = [7, 14, 30];

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="text-stone-500">{fmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
      <div className="mt-0.5 font-medium text-stone-900">{p.present} present</div>
    </div>
  );
}

export function Analytics() {
  const [days, setDays] = useState(14);
  const [onlyLow, setOnlyLow] = useState(false);
  const trends = useData(() => fetchTrends(days), [days]);
  // Reports default to all subjects, not whichever lecture happens to be running now
  const choice = useLectureChoice();
  const lectureId = choice.auto ? null : choice.lectureId;
  const report = useData(() => fetchStudentReport(lectureId), [lectureId]);

  const rows = [...(report.data ?? [])]
    .filter((r) => !onlyLow || (r.percentage !== null && r.percentage < LOW_ATTENDANCE))
    .sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101) || a.roll_number.localeCompare(b.roll_number));
  const lowCount = report.data?.filter((r) => r.percentage !== null && r.percentage < LOW_ATTENDANCE).length ?? 0;
  const chartData = (trends.data ?? []).map((t) => ({ ...t, label: fmtDate(t.date, { day: 'numeric', month: 'short' }) }));

  return (
    <>
      <PageHeader title="Reports" />
      {(trends.error || report.error) && <ErrorNote message={(trends.error || report.error)!} />}

      <Card
        className="mb-6"
        title="Students present per day"
        action={
          <div className="flex rounded-md border border-stone-300 p-0.5 text-xs" role="group" aria-label="Date range">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={`rounded px-2.5 py-1 font-medium ${days === d ? 'bg-stone-800 text-white' : 'text-stone-600 hover:text-stone-900'}`}
              >
                {d} days
              </button>
            ))}
          </div>
        }
      >
        {!trends.data ? (
          <Loading />
        ) : (
          <div className="p-4">
            <div className="h-64" role="img" aria-label={`Bar chart of students present per day over the last ${days} days`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="#e7e5e4" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: '#d6d3d1' }}
                    tick={{ fill: '#78716c', fontSize: 12 }}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#78716c', fontSize: 12 }} />
                  <Tooltip content={<TrendTooltip />} cursor={{ fill: '#f5f5f4' }} />
                  <Bar dataKey="present" fill="#0d8a6f" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-stone-500 hover:text-stone-800">Show as table</summary>
              <table className={`${table.el} mt-2`}>
                <thead>
                  <tr>
                    <th className={table.th}>Date</th>
                    <th className={`${table.th} text-right`}>Present</th>
                  </tr>
                </thead>
                <tbody>
                  {trends.data.map((t) => (
                    <tr key={t.date}>
                      <td className={table.td}>{fmtDate(t.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                      <td className={`${table.td} text-right tabular-nums`}>{t.present}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}
      </Card>

      <Card
        title="Attendance by student"
        action={
          <div className="flex flex-wrap items-center gap-4">
          <LecturePicker lectures={choice.lectures} value={lectureId} onChange={choice.choose} noneLabel="All subjects" />
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="accent-accent" />
            Only below {LOW_ATTENDANCE}% ({lowCount})
          </label>
          </div>
        }
      >
        <p className="border-b border-stone-100 px-4 py-2.5 text-xs text-stone-500">
          {lectureId
            ? "Counts each day this lecture's attendance was taken, for students in its class. Late counts as attended."
            : 'A class day is any day attendance was taken. Each student is counted from the day they were added.'}{' '}
          Excused days are left out.
        </p>
        {!report.data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState>{onlyLow ? `No one is below ${LOW_ATTENDANCE}%.` : 'No students yet.'}</EmptyState>
        ) : (
          <div className={table.wrap}>
            <table className={table.el}>
              <thead>
                <tr>
                  <th className={table.th}>Roll no.</th>
                  <th className={table.th}>Name</th>
                  <th className={table.th}>Branch</th>
                  <th className={table.th}>Sem</th>
                  <th className={`${table.th} text-right`}>Attended</th>
                  <th className={`${table.th} text-right`}>Late</th>
                  <th className={`${table.th} text-right`}>Excused</th>
                  <th className={`${table.th} w-48`}>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const low = r.percentage !== null && r.percentage < LOW_ATTENDANCE;
                  return (
                    <tr key={r.student_id} className="hover:bg-stone-50">
                      <td className={`${table.td} font-mono text-xs`}>{r.roll_number}</td>
                      <td className={`${table.td} font-medium`}>{r.name}</td>
                      <td className={table.td}>{r.branch}</td>
                      <td className={table.td}>{r.semester}</td>
                      <td className={`${table.td} text-right tabular-nums`}>
                        {r.present_days} / {r.total_days}
                      </td>
                      <td className={`${table.td} text-right tabular-nums text-stone-600`}>{r.late_days || '–'}</td>
                      <td className={`${table.td} text-right tabular-nums text-stone-600`}>{r.excused_days || '–'}</td>
                      <td className={table.td}>
                        {r.percentage === null ? (
                          <span className="text-stone-400">No class days yet</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                              <div className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${r.percentage}%` }} />
                            </div>
                            <span className={`w-12 text-right tabular-nums ${low ? 'font-medium text-red-700' : ''}`}>{r.percentage}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
