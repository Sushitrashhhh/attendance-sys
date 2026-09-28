import type { Lecture } from '../types';
import { fmtTime } from './format';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 0 = Monday, matching the backend (JS getDay() starts at Sunday). */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;

/** Minutes a lecture counts as "current" before it starts, so the teacher can open the camera early. */
const EARLY_MINUTES = 10;

const minutes = (hhmmss: string) => {
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + m;
};

/** The lecture running right now (or starting within a few minutes), if any. */
export function currentLecture(lectures: Lecture[] | null | undefined, now = new Date()): Lecture | undefined {
  const day = weekdayOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return lectures?.find(
    (l) => l.weekday === day && nowMin >= minutes(l.start_time) - EARLY_MINUTES && nowMin < minutes(l.end_time)
  );
}

export const lectureTime = (l: Lecture) => `${fmtTime(l.start_time)}–${fmtTime(l.end_time)}`;

export const lectureClass = (l: Lecture) =>
  [l.branch, l.semester ? `Sem ${l.semester}` : null].filter(Boolean).join(' · ') || 'Any student';
