import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { attendanceExportUrl, deleteAttendance, fetchAttendance, fetchLectures } from '../api/client';
import { Card, EmptyState, ErrorNote, LateTag, Loading, MethodTag, PageHeader, Pager, button, table } from '../components/ui';
import { lectureTime, WEEKDAYS } from '../lib/lectures';
import { fmtDate, fmtTime, isoDate, pct } from '../lib/format';
import { useData } from '../lib/useData';
import type { AttendanceRecord } from '../types';

const PAGE_SIZE = 50;

export function AttendanceRecords() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lectureId, setLectureId] = useState<number | undefined>(undefined);
  const [skip, setSkip] = useState(0);
  const lectures = useData(fetchLectures, []);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setSkip(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const changeRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    setSkip(0);
  };

  const filters = { search: query, date_from: from, date_to: to, lecture_id: lectureId };
  const { data, error, reload } = useData(
    () => fetchAttendance({ ...filters, skip, limit: PAGE_SIZE }),
    [query, from, to, lectureId, skip]
  );

  const setRange = (days: number | null) => {
    changeRange(days === null ? '' : isoDate(-(days - 1)), days === null ? '' : isoDate());
  };

  const remove = async (r: AttendanceRecord) => {
    if (!window.confirm(`Remove ${r.student_name}'s attendance on ${fmtDate(r.attendance_date)}?`)) return;
    setActionError(null);
    try {
      await deleteAttendance(r.id);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not remove the record.');
    }
  };

  const total = data?.total ?? 0;
  const invalidRange = !!from && !!to && from > to;

  return (
    <>
      <PageHeader title="Records" subtitle="Every check-in, newest first.">
        <a
          href={attendanceExportUrl(filters)}
          download
          className={`${button.secondary} ${total === 0 ? 'pointer-events-none opacity-50' : ''}`}
          aria-disabled={total === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV{total > 0 ? ` (${total})` : ''}
        </a>
      </PageHeader>

      {(error || actionError) && <ErrorNote message={(error || actionError)!} />}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-stone-200 p-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, roll number or branch"
            aria-label="Search records"
            className="w-full sm:w-64"
          />
          <label className="flex items-center gap-2 text-sm text-stone-600">
            From
            <input type="date" value={from} max={to || undefined} onChange={(e) => changeRange(e.target.value, to)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            To
            <input type="date" value={to} min={from || undefined} onChange={(e) => changeRange(from, e.target.value)} />
          </label>
          {(lectures.data?.length ?? 0) > 0 && (
            <label className="flex items-center gap-2 text-sm text-stone-600">
              Lecture
              <select
                value={lectureId ?? ''}
                onChange={(e) => {
                  setLectureId(e.target.value ? Number(e.target.value) : undefined);
                  setSkip(0);
                }}
                className="max-w-[14rem]"
              >
                <option value="">All</option>
                {lectures.data!.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.subject} · {WEEKDAYS[l.weekday].slice(0, 3)} {lectureTime(l)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-1 text-sm">
            <button className={`${button.small} text-stone-600 hover:bg-stone-100`} onClick={() => setRange(1)}>
              Today
            </button>
            <button className={`${button.small} text-stone-600 hover:bg-stone-100`} onClick={() => setRange(7)}>
              Last 7 days
            </button>
            <button className={`${button.small} text-stone-600 hover:bg-stone-100`} onClick={() => setRange(30)}>
              Last 30 days
            </button>
            {(from || to) && (
              <button className={`${button.small} text-stone-600 hover:bg-stone-100`} onClick={() => setRange(null)}>
                All dates
              </button>
            )}
          </div>
        </div>

        {invalidRange ? (
          <EmptyState>The “From” date is after the “To” date.</EmptyState>
        ) : !data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <EmptyState>{query || from || to || lectureId ? 'No records match these filters.' : 'No attendance has been taken yet.'}</EmptyState>
        ) : (
          <div className={table.wrap}>
            <table className={table.el}>
              <thead>
                <tr>
                  <th className={table.th}>Date</th>
                  <th className={table.th}>Time</th>
                  <th className={table.th}>Student</th>
                  <th className={table.th}>Lecture</th>
                  <th className={table.th}>How</th>
                  <th className={`${table.th} text-right`} title="Face match confidence">
                    Match
                  </th>
                  <th className={`${table.th} text-right`} title="Liveness (anti-spoofing) score">
                    Liveness
                  </th>
                  <th className={table.th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <td className={`${table.td} whitespace-nowrap`}>{fmtDate(r.attendance_date)}</td>
                    <td className={`${table.td} font-mono text-xs`}>{fmtTime(r.attendance_time)}</td>
                    <td className={table.td}>
                      <div className="font-medium">{r.student_name}</div>
                      <div className="font-mono text-xs text-stone-500">{r.roll_number}</div>
                    </td>
                    <td className={table.td}>
                      <div>{r.lecture_subject ?? <span className="text-stone-400">Whole day</span>}</div>
                      <div className="text-xs text-stone-500">{r.branch}</div>
                    </td>
                    <td className={table.td}>
                      <span className="inline-flex gap-1">
                        <MethodTag method={r.method} />
                        <LateTag status={r.status} />
                      </span>
                    </td>
                    <td className={`${table.td} text-right tabular-nums`}>{r.method === 'face' ? pct(r.confidence) : '–'}</td>
                    <td className={`${table.td} text-right tabular-nums`}>{r.method === 'face' ? pct(r.liveness_score) : '–'}</td>
                    <td className={`${table.td} text-right`}>
                      <button className={`${button.small} text-stone-500 hover:bg-red-50 hover:text-red-700`} onClick={() => remove(r)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!invalidRange && <Pager skip={skip} limit={PAGE_SIZE} total={total} onChange={setSkip} />}
      </Card>
    </>
  );
}
