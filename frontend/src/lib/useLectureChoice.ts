import { useState } from 'react';
import { fetchLectures } from '../api/client';
import { currentLecture } from './lectures';
import { useData } from './useData';

/**
 * Which lecture a page is working with. Until the user picks one, it follows the clock:
 * the lecture running now (from the timetable), otherwise the whole day (null).
 */
export function useLectureChoice() {
  const { data } = useData(fetchLectures, []);
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  const lectures = data ?? [];
  const lectureId = chosen === undefined ? currentLecture(lectures)?.id ?? null : chosen;

  return {
    lectures,
    loaded: data !== null,
    lectureId,
    lecture: lectures.find((l) => l.id === lectureId) ?? null,
    auto: chosen === undefined,
    choose: setChosen,
  };
}
