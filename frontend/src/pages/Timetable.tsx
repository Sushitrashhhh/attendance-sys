import React, { useState } from 'react';
import { createLecture, deleteLecture, fetchLectures } from '../api/client';
import { Card, EmptyState, ErrorNote, Field, Loading, PageHeader, button, table } from '../components/ui';
import { BRANCHES, SEMESTERS } from '../lib/constants';
import { lectureClass, lectureTime, WEEKDAYS, weekdayOf } from '../lib/lectures';
import { useData } from '../lib/useData';
import type { Lecture, LectureInput } from '../types';

const blank = (): LectureInput => ({
  subject: '',
  branch: '',
  semester: null,
  weekday: weekdayOf(new Date()),
  start_time: '09:00',
  end_time: '10:00',
  late_after_minutes: 10,
});

export function Timetable() {
  const { data, error, reload } = useData(fetchLectures, []);
  const [form, setForm] = useState<LectureInput>(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof LectureInput>(key: K, value: LectureInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.end_time <= form.start_time) return setFormError('The lecture has to end after it starts.');
    setSaving(true);
    setFormError(null);
    try {
      await createLecture({ ...form, subject: form.subject.trim(), branch: form.branch?.trim() || null });
      // Keep day, class and times: consecutive lectures are usually entered together
      setForm((f) => ({ ...f, subject: '' }));
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the lecture.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: Lecture) => {
    if (!window.confirm(`Remove ${l.subject} (${WEEKDAYS[l.weekday]} ${lectureTime(l)}) from the timetable? Past attendance is kept.`)) return;
    try {
      await deleteLecture(l.id);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not remove the lecture.');
    }
  };

  const byDay = WEEKDAYS.map((_, day) => (data ?? []).filter((l) => l.weekday === day));

  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle="Weekly lectures. Take attendance picks the lecture that's on right now, and anyone arriving after the late cutoff is marked late."
      />
      {error && <ErrorNote message={error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Add a lecture" className="h-fit">
          <form onSubmit={add} className="space-y-4 p-4">
            {formError && <ErrorNote message={formError} />}
            <Field label="Subject">
              <input type="text" required minLength={2} maxLength={100} value={form.subject} onChange={(e) => set('subject', e.target.value)} className="w-full" placeholder="e.g. Database Systems" />
            </Field>
            <Field label="Day">
              <select value={form.weekday} onChange={(e) => set('weekday', Number(e.target.value))} className="w-full">
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <input type="time" required value={form.start_time} onChange={(e) => set('start_time', e.target.value)} className="w-full" />
              </Field>
              <Field label="Ends">
                <input type="time" required value={form.end_time} onChange={(e) => set('end_time', e.target.value)} className="w-full" />
              </Field>
            </div>
            <Field label="Late after (minutes)">
              <input type="number" min={0} max={180} required value={form.late_after_minutes} onChange={(e) => set('late_after_minutes', Number(e.target.value))} className="w-full" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch (optional)">
                <input type="text" list="tt-branches" maxLength={100} value={form.branch ?? ''} onChange={(e) => set('branch', e.target.value)} className="w-full" placeholder="Any" />
                <datalist id="tt-branches">
                  {BRANCHES.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
              <Field label="Semester">
                <select value={form.semester ?? ''} onChange={(e) => set('semester', e.target.value ? Number(e.target.value) : null)} className="w-full">
                  <option value="">Any</option>
                  {SEMESTERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-xs text-stone-500">With a branch or semester set, only those students are marked for this lecture.</p>
            <button type="submit" className={`${button.primary} w-full`} disabled={saving}>
              {saving ? 'Adding…' : 'Add lecture'}
            </button>
          </form>
        </Card>

        <Card title="This week" className="lg:col-span-2">
          {!data ? (
            <Loading />
          ) : data.length === 0 ? (
            <EmptyState>No lectures yet. Without a timetable, attendance is taken once per day.</EmptyState>
          ) : (
            <div className={table.wrap}>
              <table className={table.el}>
                <thead>
                  <tr>
                    <th className={table.th}>Day</th>
                    <th className={table.th}>Time</th>
                    <th className={table.th}>Subject</th>
                    <th className={table.th}>Class</th>
                    <th className={table.th}>Late after</th>
                    <th className={table.th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.flatMap((lectures, day) =>
                    lectures.map((l, i) => (
                      <tr key={l.id} className="hover:bg-stone-50">
                        <td className={`${table.td} font-medium`}>{i === 0 ? WEEKDAYS[day] : ''}</td>
                        <td className={`${table.td} whitespace-nowrap font-mono text-xs`}>{lectureTime(l)}</td>
                        <td className={table.td}>{l.subject}</td>
                        <td className={`${table.td} text-stone-600`}>{lectureClass(l)}</td>
                        <td className={`${table.td} tabular-nums text-stone-600`}>{l.late_after_minutes} min</td>
                        <td className={`${table.td} text-right`}>
                          <button className={`${button.small} text-stone-500 hover:bg-red-50 hover:text-red-700`} onClick={() => remove(l)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
