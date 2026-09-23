import type { HealthStatus, Student, AttendanceRecord, AnalyticsOverview } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return {
        status: 'error',
        database: 'disconnected',
        version: '1.0.0',
        environment: 'unknown',
        details: { error: `HTTP ${res.status}: ${res.statusText}` },
      };
    }
    return await res.json();
  } catch (err) {
    return {
      status: 'error',
      database: 'disconnected',
      version: '1.0.0',
      environment: 'unknown',
      details: { error: err instanceof Error ? err.message : 'Backend unreachable' },
    };
  }
}

export async function fetchStudents(search?: string): Promise<{ total: number; items: Student[] }> {
  const url = new URL(`${API_BASE_URL}/api/students`, window.location.origin);
  if (search && search.trim()) {
    url.searchParams.set('search', search.trim());
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch students');
  return res.json();
}

export async function registerStudent(formData: FormData): Promise<Student> {
  const res = await fetch(`${API_BASE_URL}/api/students`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: 'Registration failed' }));
    throw new Error(errData.detail || 'Registration failed');
  }
  return res.json();
}

export async function deleteStudent(studentId: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/students/${studentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: 'Deletion failed' }));
    throw new Error(errData.detail || 'Deletion failed');
  }
  return res.json();
}

export async function fetchAttendance(params?: {
  date?: string;
  student_id?: number;
  skip?: number;
  limit?: number;
}): Promise<{ total: number; items: AttendanceRecord[] }> {
  const url = new URL(`${API_BASE_URL}/api/attendance`, window.location.origin);
  if (params?.date) url.searchParams.set('date', params.date);
  if (params?.student_id) url.searchParams.set('student_id', params.student_id.toString());
  if (params?.skip) url.searchParams.set('skip', params.skip.toString());
  if (params?.limit) url.searchParams.set('limit', params.limit.toString());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch attendance');
  return res.json();
}

export async function fetchTodayAttendance(): Promise<AttendanceRecord[]> {
  const res = await fetch(`${API_BASE_URL}/api/attendance/today`);
  if (!res.ok) throw new Error("Failed to fetch today's attendance");
  return res.json();
}

export async function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/overview`);
  if (!res.ok) throw new Error('Failed to fetch analytics overview');
  return res.json();
}

export async function fetchAnalyticsTrends(days: number = 14): Promise<{ date: string; day: string; present: number }[]> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/trends?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch attendance trends');
  return res.json();
}

export async function fetchAnomalies(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/api/analytics/anomalies`);
  if (!res.ok) throw new Error('Failed to fetch anomalies');
  return res.json();
}

export async function testRecognitionJson(imageBase64: string, autoMark: boolean = true): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/recognition/test-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64, auto_mark: autoMark }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Recognition test failed' }));
    throw new Error(err.detail || 'Recognition test failed');
  }
  return res.json();
}
