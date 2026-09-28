import { useState } from 'react';
import { Camera } from 'lucide-react';
import {
  deleteAttendance,
  fetchAbsentToday,
  fetchOverview,
  fetchTodayAttendance,
  markPresent,
} from '../api/client';
import { ExcuseForm } from '../components/Excusals';
import { LecturePicker } from '../components/LecturePicker';
import { Card, EmptyState, ErrorNote, LateTag, Loading, MethodTag, Modal, PageHeader, button } from '../components/ui';
import { fmtTime, isoDate, fmtDate } from '../lib/format';
import { lectureTime } from '../lib/lectures';
import { useData } from '../lib/useData';
import { useLectureChoice } from '../lib/useLectureChoice';
import type { Student } from '../types';

export function Dashboard() {
  const choice = useLectureChoice();
  const { lectureId, lecture } = choice;
  const { data, error, reload } = useData(
    () => Promise.all([fetchOverview(lectureId), fetchTodayAttendance(lectureId), fetchAbsentToday(lectureId)]),
    [lectureId],
    15000
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [excusing, setExcusing] = useState<Student | null>(null);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const [overview, present, absent] = data ?? [null, [], []];
  const term = filter.trim().toLowerCase();
  const absentShown = term
    ? absent.filter((s) => s.name.toLowerCase().includes(term) || s.roll_number.toLowerCase().includes(term))
    : absent;
  const rate = overview && overview.total_students > 0 ? overview.present_today / overview.total_students : 0;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`${fmtDate(isoDate(), { weekday: 'long', day: 'numeric', month: 'long' })}${
          lecture ? ` · ${lecture.subject}, ${lectureTime(lecture)}` : ''
        }`}
      >
        <LecturePicker lectures={choice.lectures} value={lectureId} onChange={choice.choose} />
        <a href="#live" className={button.primary}>
          <Camera className="h-4 w-4" />
          Take attendance
        </a>
      </PageHeader>

      {error && <ErrorNote message={error} />}
      {actionError && <ErrorNote message={actionError} />}

      <Card className="mb-6 p-5">
        {!overview ? (
          <Loading />
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm text-stone-500">{lecture ? `Present in ${lecture.subject}` : 'Present today'}</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">
                {overview.present_today}
                <span className="text-lg font-normal text-stone-400"> / {overview.total_students}</span>
              </div>
              <div className="mt-3 h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-accent" style={{ width: `${rate * 100}%` }} />
              </div>
            </div>
            <dl className="flex gap-8 text-sm">
              {lecture && (
                <div>
                  <dt className="text-stone-500">Late</dt>
                  <dd className="mt-0.5 text-lg font-medium tabular-nums">{overview.late_today}</dd>
                </div>
              )}
              <div>
                <dt className="text-stone-500">Not marked</dt>
                <dd className="mt-0.5 text-lg font-medium tabular-nums">{overview.absent_today}</dd>
              </div>
              {overview.excused_today > 0 && (
                <div>
                  <dt className="text-stone-500">Excused</dt>
                  <dd className="mt-0.5 text-lg font-medium tabular-nums">{overview.excused_today}</dd>
                </div>
              )}
              <div>
                <dt className="text-stone-500">Attendance rate</dt>
                <dd className="mt-0.5 text-lg font-medium tabular-nums">{overview.attendance_rate}%</dd>
              </div>
            </dl>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={`Not marked yet${absent.length ? ` (${absent.length})` : ''}`}
          action={
            absent.length > 8 && (
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter…"
                aria-label="Filter students not marked yet"
                className="!w-40 !py-1"
              />
            )
          }
        >
          {!data ? (
            <Loading />
          ) : absent.length === 0 ? (
            <EmptyState>
              {overview?.total_students
                ? overview.excused_today
                  ? 'Everyone is marked present or excused.'
                  : 'Everyone is marked present.'
                : 'No students yet. '}
              {!overview?.total_students && (
                <a href="#register" className="text-accent underline">
                  Add the first one
                </a>
              )}
            </EmptyState>
          ) : (
            <ul className="max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
              {absentShown.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    <div className="font-mono text-xs text-stone-500">{s.roll_number}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className={`${button.small} text-stone-600 hover:bg-stone-100`}
                      onClick={() => setExcusing(s)}
                      title="Medical, leave or college event: won't count against their attendance"
                    >
                      Excuse
                    </button>
                    <button
                      className={`${button.small} border border-stone-300 text-stone-700 hover:bg-stone-100`}
                      disabled={busy === `s${s.id}`}
                      onClick={() => run(`s${s.id}`, () => markPresent(s.id, lectureId))}
                    >
                      {busy === `s${s.id}` ? 'Marking…' : 'Mark present'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Checked in today${present.length ? ` (${present.length})` : ''}`}>
          {!data ? (
            <Loading />
          ) : present.length === 0 ? (
            <EmptyState>No one has checked in yet today.</EmptyState>
          ) : (
            <ul className="max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
              {present.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.student_name}</div>
                    <div className="font-mono text-xs text-stone-500">
                      {r.roll_number}
                      {!lecture && r.lecture_subject && <span className="font-sans"> · {r.lecture_subject}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <LateTag status={r.status} />
                    <MethodTag method={r.method} />
                    <span className="font-mono text-xs text-stone-500">{fmtTime(r.attendance_time)}</span>
                    <button
                      className={`${button.small} text-stone-500 hover:bg-red-50 hover:text-red-700`}
                      disabled={busy === `r${r.id}`}
                      onClick={() => {
                        if (window.confirm(`Remove today's attendance for ${r.student_name}?`)) {
                          run(`r${r.id}`, () => deleteAttendance(r.id));
                        }
                      }}
                    >
                      Undo
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {excusing && (
        <Modal open title={`Excuse ${excusing.name}`} onClose={() => setExcusing(null)}>
          <ExcuseForm
            studentId={excusing.id}
            onCancel={() => setExcusing(null)}
            onSaved={() => {
              setExcusing(null);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
