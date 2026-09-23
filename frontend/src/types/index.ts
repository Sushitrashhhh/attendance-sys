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
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: number;
  student_id: number;
  student_name?: string;
  roll_number?: string;
  branch?: string;
  attendance_date: string;
  attendance_time: string;
  status: 'present' | 'absent' | 'late';
  confidence: number;
  liveness_score: number;
  created_at: string;
}

export interface AnalyticsOverview {
  total_students: number;
  present_today: number;
  absent_today: number;
  attendance_rate: number;
}

export type UIRecognitionState =
  | 'IDLE'
  | 'SCANNING'
  | 'FACE_DETECTED'
  | 'RECOGNIZING'
  | 'LIVENESS_CHECK'
  | 'IDENTIFIED'
  | 'ATTENDANCE_MARKED'
  | 'ALREADY_MARKED'
  | 'UNKNOWN'
  | 'SPOOF_DETECTED'
  | 'ERROR';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  bbox: BoundingBox;
  landmarks?: [number, number][];
  confidence: number;
  liveness_score?: number;
  is_live?: boolean;
  liveness_reason?: string;
  student_id?: number;
  student_name?: string;
  roll_number?: string;
  similarity?: number;
  attendance_status?: 'marked' | 'already_marked' | 'unknown' | 'liveness_failed';
  state: UIRecognitionState;
}
