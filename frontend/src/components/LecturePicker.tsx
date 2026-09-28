import { currentLecture, lectureClass, lectureTime, WEEKDAYS, weekdayOf } from '../lib/lectures';
import type { Lecture } from '../types';

/** Select a timetable lecture (today's first) or the whole day. Hidden when there is no timetable. */
export function LecturePicker({
  lectures,
  value,
  onChange,
  noneLabel = 'Whole day',
}: {
  lectures: Lecture[];
  value: number | null;
  onChange: (id: number | null) => void;
  noneLabel?: string;
}) {
  if (lectures.length === 0) return null;

  const today = weekdayOf(new Date());
  const now = currentLecture(lectures);
  const days = [...new Set(lectures.map((l) => l.weekday))].sort((a, b) => ((a - today + 7) % 7) - ((b - today + 7) % 7));

  return (
    <label className="flex items-center gap-2 text-sm text-stone-600">
      Lecture
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="max-w-full"
      >
        <option value="">{noneLabel}</option>
        {days.map((day) => (
          <optgroup key={day} label={day === today ? `Today (${WEEKDAYS[day]})` : WEEKDAYS[day]}>
            {lectures
              .filter((l) => l.weekday === day)
              .map((l) => (
                <option key={l.id} value={l.id} title={lectureClass(l)}>
                  {l.subject} · {lectureTime(l)}
                  {l.id === now?.id ? ' (now)' : ''}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
