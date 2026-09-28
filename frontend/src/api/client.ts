import type {
  AnalyticsOverview,
  Anomaly,
  AttendanceFilters,
  AttendanceRecord,
  Excusal,
  HealthStatus,
  Lecture,
  LectureInput,
  RecognitionResult,
  SelfCheck,
  Student,
  StudentPatch,
  StudentReportRow,
  TrendPoint,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE_URL + path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    // FastAPI validation errors come back as a list of {msg, loc}
    const message =
      typeof detail === 'string' ? detail : Array.isArray(detail) ? detail[0]?.msg : undefined;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return res.json();
}

const sendJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function query(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    return await request<HealthStatus>('/health');
  } catch (err) {
    return {
      status: 'error',
      database: 'disconnected',
      version: '',
      environment: 'unknown',
      details: { error: err instanceof Error ? err.message : 'Backend unreachable' },
    };
  }
}

// Students
export const fetchStudents = (params: { search?: string; skip?: number; limit?: number } = {}) =>
  request<{ total: number; items: Student[] }>(`/api/students${query(params)}`);

export const registerStudent = (formData: FormData) =>
  request<Student>('/api/students', { method: 'POST', body: formData });

export const updateStudent = (id: number, patch: StudentPatch) =>
  request<Student>(`/api/students/${id}`, sendJson('PUT', patch));

export const deleteStudent = (id: number) =>
  request<{ success: boolean }>(`/api/students/${id}`, { method: 'DELETE' });

export const forgetLearnedFaces = (id: number) =>
  request<{ removed: number }>(`/api/students/${id}/face-samples`, { method: 'DELETE' });

// Timetable
export const fetchLectures = () => request<Lecture[]>('/api/lectures');

export const createLecture = (lecture: LectureInput) => request<Lecture>('/api/lectures', sendJson('POST', lecture));

export const deleteLecture = (id: number) =>
  request<{ success: boolean }>(`/api/lectures/${id}`, { method: 'DELETE' });

type LectureId = number | null | undefined;
const lectureQuery = (lectureId: LectureId) => query({ lecture_id: lectureId ?? undefined });

// Attendance
export const fetchAttendance = (filters: AttendanceFilters = {}) =>
  request<{ total: number; items: AttendanceRecord[] }>(`/api/attendance${query({ ...filters })}`);

export const attendanceExportUrl = ({ search, date_from, date_to, lecture_id }: AttendanceFilters) =>
  `${API_BASE_URL}/api/attendance/export${query({ search, date_from, date_to, lecture_id })}`;

export const fetchTodayAttendance = (lectureId?: LectureId) =>
  request<AttendanceRecord[]>(`/api/attendance/today${lectureQuery(lectureId)}`);

export const fetchAbsentToday = (lectureId?: LectureId) =>
  request<Student[]>(`/api/attendance/absent-today${lectureQuery(lectureId)}`);

export const markPresent = (studentId: number, lectureId?: LectureId) =>
  request<AttendanceRecord>(
    '/api/attendance/mark',
    sendJson('POST', { student_id: studentId, lecture_id: lectureId ?? null })
  );

export const deleteAttendance = (id: number) =>
  request<{ success: boolean }>(`/api/attendance/${id}`, { method: 'DELETE' });

// Analytics
export const fetchOverview = (lectureId?: LectureId) =>
  request<AnalyticsOverview>(`/api/analytics/overview${lectureQuery(lectureId)}`);

export const fetchTrends = (days = 14) => request<TrendPoint[]>(`/api/analytics/trends?days=${days}`);

export const fetchStudentReport = (lectureId?: LectureId) =>
  request<StudentReportRow[]>(`/api/analytics/students${lectureQuery(lectureId)}`);

export const fetchAnomalies = () => request<Anomaly[]>('/api/analytics/anomalies');

export const dismissFailedChecks = (studentId: number, date: string) =>
  request<{ removed: number }>(`/api/analytics/failed-checks${query({ student_id: studentId, date })}`, {
    method: 'DELETE',
  });

export const fetchSelfCheck = (rollNumber: string) =>
  request<SelfCheck>(`/api/analytics/self-check/${encodeURIComponent(rollNumber.trim())}`);

// Excused absences
export const fetchExcusals = (studentId: number) => request<Excusal[]>(`/api/excusals${query({ student_id: studentId })}`);

export const createExcusal = (excusal: Omit<Excusal, 'id' | 'created_at'>) =>
  request<Excusal>('/api/excusals', sendJson('POST', excusal));

export const deleteExcusal = (id: number) => request<{ success: boolean }>(`/api/excusals/${id}`, { method: 'DELETE' });

// Recognition
export function liveSocketUrl() {
  const url = new URL('/ws/live-attendance', API_BASE_URL || window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

// HTTP fallback when the WebSocket is unavailable
export const recognizeImage = (imageBase64: string, autoMark = true, lectureId?: LectureId) =>
  request<RecognitionResult>(
    '/api/recognition/test-json',
    sendJson('POST', { image_base64: imageBase64, auto_mark: autoMark, lecture_id: lectureId ?? null })
  );
