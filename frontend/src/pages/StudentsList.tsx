import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { deleteStudent, fetchStudentReport, fetchStudents, forgetLearnedFaces, updateStudent } from '../api/client';
import { ExcusalList } from '../components/Excusals';
import { Card, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader, Pager, button, table } from '../components/ui';
import { fmtDate } from '../lib/format';
import { useData } from '../lib/useData';
import { BRANCHES, LOW_ATTENDANCE, SEMESTERS } from '../lib/constants';
import type { Student } from '../types';

const PAGE_SIZE = 50;

export function StudentsList() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [skip, setSkip] = useState(0);
  const [editing, setEditing] = useState<Student | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Debounce typing, and go back to page 1 when the search changes
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setSkip(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const students = useData(() => fetchStudents({ search: query, skip, limit: PAGE_SIZE }), [query, skip]);
  const report = useData(() => fetchStudentReport(), []);
  const pctById = new Map(report.data?.map((r) => [r.student_id, r]) ?? []);

  const remove = async (s: Student) => {
    setActionError(null);
    try {
      await deleteStudent(s.id);
      setConfirmDelete(null);
      students.reload();
      report.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete the student.');
    }
  };

  const total = students.data?.total ?? 0;
  const rows = students.data?.items ?? [];

  return (
    <>
      <PageHeader title="Students" subtitle={students.data ? `${total} enrolled` : undefined}>
        <a href="#register" className={button.primary}>
          <UserPlus className="h-4 w-4" />
          Add student
        </a>
      </PageHeader>

      {(students.error || actionError) && <ErrorNote message={(students.error || actionError)!} />}

      <Card>
        <div className="border-b border-stone-200 p-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, roll number or branch"
            aria-label="Search students"
            className="w-full sm:w-80"
          />
        </div>

        {!students.data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState>
            {query ? (
              <>No students match “{query}”.</>
            ) : (
              <>
                No students yet.{' '}
                <a href="#register" className="text-accent underline">
                  Add the first one
                </a>
              </>
            )}
          </EmptyState>
        ) : (
          <div className={table.wrap}>
            <table className={table.el}>
              <thead>
                <tr>
                  <th className={table.th}>Name</th>
                  <th className={table.th}>Roll no.</th>
                  <th className={table.th}>Branch</th>
                  <th className={table.th}>Sem</th>
                  <th className={table.th}>Attendance</th>
                  <th className={table.th} title="Extra face references learned from confident live check-ins">
                    Learned scans
                  </th>
                  <th className={table.th}>Enrolled</th>
                  <th className={table.th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const r = pctById.get(s.id);
                  const low = r?.percentage != null && r.percentage < LOW_ATTENDANCE;
                  return (
                    <tr key={s.id} className="hover:bg-stone-50">
                      <td className={`${table.td} font-medium`}>{s.name}</td>
                      <td className={`${table.td} font-mono text-xs`}>{s.roll_number}</td>
                      <td className={table.td}>{s.branch}</td>
                      <td className={table.td}>{s.semester}</td>
                      <td className={`${table.td} tabular-nums`}>
                        {r?.percentage == null ? (
                          <span className="text-stone-400">–</span>
                        ) : (
                          <span className={low ? 'font-medium text-red-700' : ''} title={`${r.present_days} of ${r.total_days} class days`}>
                            {r.percentage}%
                          </span>
                        )}
                      </td>
                      <td className={`${table.td} tabular-nums text-stone-600`}>{s.learned_samples || '–'}</td>
                      <td className={`${table.td} text-stone-500`}>{fmtDate(s.created_at.slice(0, 10))}</td>
                      <td className={`${table.td} whitespace-nowrap text-right`}>
                        {confirmDelete === s.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-stone-500">Delete student and their records?</span>
                            <button className={`${button.small} bg-red-600 text-white hover:bg-red-700`} onClick={() => remove(s)}>
                              Delete
                            </button>
                            <button className={`${button.small} text-stone-600 hover:bg-stone-100`} onClick={() => setConfirmDelete(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex gap-1">
                            <button className={`${button.small} text-stone-600 hover:bg-stone-100`} onClick={() => setEditing(s)}>
                              Edit
                            </button>
                            <button className={`${button.small} text-stone-600 hover:bg-red-50 hover:text-red-700`} onClick={() => setConfirmDelete(s.id)}>
                              Delete
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager skip={skip} limit={PAGE_SIZE} total={total} onChange={setSkip} />
      </Card>

      {editing && (
        <EditStudent
          key={editing.id}
          student={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            students.reload();
          }}
          onForgot={students.reload}
          onExcusalsChanged={report.reload}
        />
      )}
    </>
  );
}

function EditStudent({
  student,
  onClose,
  onSaved,
  onForgot,
  onExcusalsChanged,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
  onForgot: () => void;
  onExcusalsChanged: () => void;
}) {
  const [learned, setLearned] = useState(student.learned_samples);
  const [form, setForm] = useState({
    name: student.name,
    roll_number: student.roll_number,
    branch: student.branch,
    semester: student.semester,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateStudent(student.id, { ...form, name: form.name.trim(), roll_number: form.roll_number.trim(), branch: form.branch.trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="Edit student" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {error && <ErrorNote message={error} />}
        <Field label="Full name">
          <input type="text" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" />
        </Field>
        <Field label="Roll number">
          <input type="text" required maxLength={50} value={form.roll_number} onChange={(e) => setForm({ ...form, roll_number: e.target.value })} className="w-full font-mono uppercase" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Branch">
            <input type="text" list="edit-branches" required minLength={2} maxLength={100} value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className="w-full" />
            <datalist id="edit-branches">
              {BRANCHES.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Semester">
            <select value={form.semester} onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })} className="w-full">
              {SEMESTERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="rounded-md bg-stone-50 px-3 py-2.5 text-xs text-stone-600">
          {learned > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span>
                Recognition has learned from {learned} recent check-in{learned === 1 ? '' : 's'}, so it keeps up with
                changes like a new beard or glasses.
              </span>
              <button
                type="button"
                className={`${button.small} shrink-0 border border-stone-300 bg-white hover:bg-stone-100`}
                onClick={async () => {
                  try {
                    await forgetLearnedFaces(student.id);
                    setLearned(0);
                    onForgot();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not reset.');
                  }
                }}
              >
                Forget them
              </button>
            </div>
          ) : (
            'Recognition learns from confident live check-ins over time.'
          )}
          <div className="mt-1.5">The enrollment photo can't be changed here. To re-take it, delete and add the student again.</div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={button.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={button.primary} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      <div className="mt-5 border-t border-stone-200 pt-4">
        <ExcusalList studentId={student.id} onChange={onExcusalsChanged} />
      </div>
    </Modal>
  );
}
