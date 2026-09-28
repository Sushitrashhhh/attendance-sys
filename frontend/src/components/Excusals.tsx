import React, { useState } from 'react';
import { createExcusal, deleteExcusal, fetchExcusals } from '../api/client';
import { EmptyState, ErrorNote, Field, button } from './ui';
import { fmtDate, isoDate } from '../lib/format';
import { useData } from '../lib/useData';
import type { Excusal } from '../types';

const REASONS = ['Medical', 'Leave', 'College event', 'Sports', 'Family emergency'];

const excusalRange = (e: Pick<Excusal, 'date_from' | 'date_to'>) =>
  e.date_from === e.date_to ? fmtDate(e.date_from) : `${fmtDate(e.date_from)} – ${fmtDate(e.date_to)}`;

/** Add an excused absence (defaults to today only). */
export function ExcuseForm({ studentId, onSaved, onCancel }: { studentId: number; onSaved: () => void; onCancel: () => void }) {
  const [from, setFrom] = useState(isoDate());
  const [to, setTo] = useState(isoDate());
  const [reason, setReason] = useState(REASONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (to < from) return setError("The end date can't be before the start date.");
    setSaving(true);
    setError(null);
    try {
      await createExcusal({ student_id: studentId, date_from: from, date_to: to, reason: reason.trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3">
      {error && <ErrorNote message={error} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className="w-full" />
        </Field>
        <Field label="To">
          <input type="date" required value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-full" />
        </Field>
      </div>
      <Field label="Reason">
        <input type="text" list="excuse-reasons" required minLength={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full" />
        <datalist id="excuse-reasons">
          {REASONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </Field>
      <p className="text-xs text-stone-500">Class days in this range won't count against the student's attendance.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className={button.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={button.primary} disabled={saving}>
          {saving ? 'Saving…' : 'Excuse'}
        </button>
      </div>
    </form>
  );
}

/** A student's excused absences, with add and remove. */
export function ExcusalList({ studentId, onChange }: { studentId: number; onChange?: () => void }) {
  const { data, error, reload } = useData(() => fetchExcusals(studentId), [studentId]);
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const changed = () => {
    reload();
    onChange?.();
  };

  const remove = async (e: Excusal) => {
    setActionError(null);
    try {
      await deleteExcusal(e.id);
      changed();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-stone-800">Excused absences</h3>
        {!adding && (
          <button type="button" className={`${button.small} border border-stone-300 hover:bg-stone-100`} onClick={() => setAdding(true)}>
            Add
          </button>
        )}
      </div>
      {(error || actionError) && <ErrorNote message={(error || actionError)!} />}
      {adding && (
        <div className="rounded-md border border-stone-200 p-3">
          <ExcuseForm
            studentId={studentId}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              changed();
            }}
          />
        </div>
      )}
      {data && data.length === 0 && !adding && <EmptyState>None.</EmptyState>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-md border border-stone-200 text-sm">
          {data.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                <span className="font-medium">{excusalRange(e)}</span>
                <span className="text-stone-500"> · {e.reason}</span>
              </span>
              <button type="button" className={`${button.small} text-stone-500 hover:bg-red-50 hover:text-red-700`} onClick={() => remove(e)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
