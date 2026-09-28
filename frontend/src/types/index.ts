export type Page =
  | 'overview'
  | 'live'
  | 'students'
  | 'register'
  | 'records'
  | 'reports'
  | 'timetable'
  | 'flags'
  | 'self';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'error';
  database: 'connected' | 'disconnected' | 'error' | 'unconfigured';
  version: string;
  environment: string;
  details?: {
    pgvector_installed?: boolean;
    error?: string;
  };
}

export interface Student {
  id: number;
  name: string;
  roll_number: string;
  branch: string;
  semester: number;
  active: boolean;
  learned_samples: number;
  created_at: string;
  updated_at: string;
}

export type StudentPatch = Partial<Pick<Student, 'name' | 'roll_number' | 'branch' | 'semester'>>;

export interface AttendanceRecord {
  id: number;
  student_id: number;
  student_name?: string;
  roll_number?: string;
  branch?: string;
  attendance_date: string;
  attendance_time: string;
  status: 'present' | 'late';
  confidence: number;
  liveness_score: number;
  method: 'face' | 'manual';
  lecture_id: number | null;
  lecture_subject: string | null;
  created_at: string;
}

export interface AttendanceFilters {
  search?: string;
  date_from?: string;
  date_to?: string;
  lecture_id?: number;
  skip?: number;
  limit?: number;
}

export interface AnalyticsOverview {
  total_students: number;
  present_today: number;
  late_today: number;
  excused_today: number;
  absent_today: number;
  attendance_rate: number;
  date: string;
}

export interface TrendPoint {
  date: string;
  day: string;
  present: number;
}

export interface StudentReportRow {
  student_id: number;
  name: string;
  roll_number: string;
  branch: string;
  semester: number;
  present_days: number;
  late_days: number;
  excused_days: number;
  total_days: number;
  percentage: number | null;
}

export interface Anomaly {
  type: 'BORDERLINE_CONFIDENCE' | 'BORDERLINE_LIVENESS' | 'UNUSUAL_TIME' | 'REPEATED_FAILED_CHECKS';
  record_id: number | null; // null for REPEATED_FAILED_CHECKS (not tied to one check-in)
  severity: 'low' | 'medium' | 'high';
  student_id: number;
  student_name: string;
  roll_number: string;
  date: string;
  time: string;
  reason: string;
}

export interface RecognitionResult {
  status: 'MATCH' | 'UNKNOWN' | 'NO_FACE' | 'MULTIPLE_FACES' | 'LIVENESS_FAILED' | 'ERROR';
  student?: { id: number; name: string; roll_number: string; branch?: string; semester?: number };
  confidence: number;
  liveness_score: number;
  attendance?:
    | 'MARKED'
    | 'ALREADY_MARKED'
    | 'NOT_IN_CLASS'
    | 'CHALLENGE'
    | 'CHALLENGE_FAILED'
    | 'NOT_APPLICABLE'
    | null;
  attendance_status?: 'present' | 'late' | null;
  challenge?: 'turn_left' | 'turn_right' | null;
  message?: string | null;
  bbox?: [number, number, number, number] | null;
}

export interface Lecture {
  id: number;
  subject: string;
  branch: string | null;
  semester: number | null;
  weekday: number; // 0 = Monday ... 6 = Sunday
  start_time: string; // "HH:MM:SS"
  end_time: string;
  late_after_minutes: number;
  created_at: string;
}

export type LectureInput = Omit<Lecture, 'id' | 'created_at'>;

export interface Excusal {
  id: number;
  student_id: number;
  date_from: string;
  date_to: string;
  reason: string;
  created_at: string;
}

export type Outlook = { can_miss: number } | { must_attend: number } | null;

export interface AttendanceSummary {
  present_days: number;
  late_days: number;
  excused_days: number;
  total_days: number;
  percentage: number | null;
  outlook: Outlook;
}

export interface SelfCheck {
  student: { name: string; roll_number: string; branch: string; semester: number };
  target: number;
  overall: AttendanceSummary;
  subjects: (AttendanceSummary & { subject: string })[];
  recent: AttendanceRecord[];
}
