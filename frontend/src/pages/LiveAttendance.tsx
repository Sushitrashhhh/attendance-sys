import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  UserX,
  Clock,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { fetchTodayAttendance, testRecognitionJson } from '../api/client';
import type { AttendanceRecord } from '../types';

interface LiveDetection {
  status: 'MATCH' | 'UNKNOWN' | 'NO_FACE' | 'MULTIPLE_FACES' | 'LIVENESS_FAILED' | 'ERROR';
  student?: {
    id: number;
    name: string;
    roll_number: string;
    branch?: string;
  };
  confidence: number;
  liveness_score: number;
  attendance?: 'MARKED' | 'ALREADY_MARKED' | 'NOT_APPLICABLE';
  message?: string;
  bbox?: [number, number, number, number];
}

export const LiveAttendance: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [detections, setDetections] = useState<LiveDetection[]>([]);
  const [recentLogs, setRecentLogs] = useState<AttendanceRecord[]>([]);
  const [fps, setFps] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastFpsTimeRef = useRef<number>(Date.now());
  const frameCountRef = useRef<number>(0);

  // Load today's attendance logs
  const loadRecent = async () => {
    try {
      const records = await fetchTodayAttendance();
      setRecentLogs(records.slice(0, 10));
    } catch (err) {
      console.error('Failed to load recent logs:', err);
    }
  };

  useEffect(() => {
    loadRecent();
  }, []);

  // Initialize camera
  const startCamera = async () => {
    setStreamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      // NOTE: Do NOT try to attach to videoRef here — the <video> element only
      // exists in the DOM after setIsActive(true) triggers a re-render.
      // Attachment is handled by the useEffect below.
      setIsActive(true);
      connectWebSocket();
    } catch (err) {
      setStreamError('Could not access webcam. Please verify permissions.');
      setIsActive(false);
    }
  };

  // Attach stream to the <video> element once it mounts (i.e. after isActive becomes true).
  // This is the correct pattern: videoRef.current is guaranteed non-null at this point.
  useEffect(() => {
    if (isActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((e) => {
        console.warn('Video play() failed:', e);
      });
    }
  }, [isActive]);


  const stopCamera = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsActive(false);
    setDetections([]);
    isProcessingRef.current = false;
  };

  // Setup WebSocket connection
  const connectWebSocket = () => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/live-attendance`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Live Attendance WebSocket connected');
      };

      ws.onmessage = (event) => {
        isProcessingRef.current = false;
        try {
          const data = JSON.parse(event.data);
          if (data.faces) {
            setDetections(data.faces);

            // If a student was marked present, refresh today's list
            const hasNewMark = data.faces.some(
              (f: LiveDetection) => f.attendance === 'MARKED'
            );
            if (hasNewMark) {
              loadRecent();
            }
          }
        } catch (e) {
          console.error('Error parsing WS frame:', e);
        }
      };

      ws.onerror = (e) => {
        console.warn('WS error, fallback to HTTP loop will be used:', e);
        isProcessingRef.current = false;
      };

      ws.onclose = () => {
        console.log('WS closed');
        isProcessingRef.current = false;
      };
    } catch (err) {
      console.warn('Could not connect WS directly:', err);
    }
  };

  // Continuous frame capture loop
  const frameLoop = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Calculate FPS
    frameCountRef.current++;
    const now = Date.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }

    // Capture and send frame if ready
    if (!isProcessingRef.current && video.readyState >= 2) {
      isProcessingRef.current = true;
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, 480, 360);
        const frameB64 = canvas.toDataURL('image/jpeg', 0.85);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ image: frameB64, auto_mark: true }));
        } else {
          // Fallback via HTTP JSON test endpoint
          testRecognitionJson(frameB64, true)
            .then((res) => {
              setDetections([res]);
              if (res.attendance === 'MARKED') loadRecent();
            })
            .catch(() => {})
            .finally(() => {
              isProcessingRef.current = false;
            });
        }
      } else {
        isProcessingRef.current = false;
      }
    }

    animationFrameRef.current = requestAnimationFrame(frameLoop);
  }, [isActive]);

  useEffect(() => {
    if (isActive) {
      animationFrameRef.current = requestAnimationFrame(frameLoop);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, frameLoop]);

  // Render HUD Overlay
  useEffect(() => {
    if (!overlayCanvasRef.current || !videoRef.current) return;
    const overlay = overlayCanvasRef.current;
    const video = videoRef.current;

    overlay.width = video.clientWidth || 640;
    overlay.height = video.clientHeight || 480;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!isActive) return;

    detections.forEach((det) => {
      if (!det.bbox) return;
      // Scale coordinates from capture size (480x360 or original) to client display
      const scaleX = overlay.width / 480;
      const scaleY = overlay.height / 360;
      const [bx, by, bw, bh] = det.bbox;
      const x = bx * scaleX;
      const y = by * scaleY;
      const w = bw * scaleX;
      const h = bh * scaleY;

      // Color coding based on status
      let strokeColor = '#3b82f6'; // Blue default
      let label = 'RECOGNIZING...';

      if (det.status === 'MATCH') {
        strokeColor = '#10b981'; // Emerald green
        label = `${det.student?.name || 'STUDENT'} (${Math.round(det.confidence * 100)}%)`;
      } else if (det.status === 'UNKNOWN') {
        strokeColor = '#f59e0b'; // Amber
        label = 'UNKNOWN FACE';
      } else if (det.status === 'LIVENESS_FAILED') {
        strokeColor = '#ef4444'; // Red
        label = 'SPOOF / LIVENESS FAILED';
      }

      // Draw bounding box
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Draw corner accents
      const cornerLength = Math.min(18, w * 0.2);
      ctx.lineWidth = 4;
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(x, y + cornerLength);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLength, y);
      // Top-Right
      ctx.moveTo(x + w - cornerLength, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + cornerLength);
      // Bottom-Left
      ctx.moveTo(x, y + h - cornerLength);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + cornerLength, y + h);
      // Bottom-Right
      ctx.moveTo(x + w - cornerLength, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - cornerLength);
      ctx.stroke();

      // Label background
      ctx.fillStyle = strokeColor;
      ctx.font = 'bold 12px sans-serif';
      const textMetrics = ctx.measureText(label);
      ctx.fillRect(x, Math.max(0, y - 24), textMetrics.width + 16, 24);

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 8, Math.max(16, y - 7));
    });
  }, [detections, isActive]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Camera className="h-6 w-6 text-blue-400" />
            Live Biometric Attendance Portal
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Continuous YuNet detection &bull; ArcFace 512-D vector search &bull; Passive Anti-Spoofing &bull; Real-time pgvector matching
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isActive && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>{fps} FPS</span>
            </div>
          )}

          {isActive ? (
            <button
              onClick={stopCamera}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-all shadow-lg shadow-red-600/20"
            >
              <CameraOff className="h-4 w-4" />
              <span>Stop Camera</span>
            </button>
          ) : (
            <button
              onClick={startCamera}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/25"
            >
              <Camera className="h-4 w-4" />
              <span>Start Camera</span>
            </button>
          )}
        </div>
      </div>

      {streamError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {streamError}
        </div>
      )}

      {/* Main Split Grid: Camera HUD + Live Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera Viewport (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative aspect-video rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-2xl flex items-center justify-center">
            {isActive ? (
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
                <canvas
                  ref={overlayCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none -scale-x-100"
                />
                {/* Live Badge */}
                <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-3 py-1 rounded-full text-xs font-semibold text-white flex items-center gap-2 shadow-lg">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>VISION RUNTIME ACTIVE</span>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 space-y-3">
                <div className="h-16 w-16 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                  <Camera className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold text-white">Camera Standby</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Click <strong>Start Camera</strong> to begin live multi-face tracking and attendance verification.
                </p>
                <button
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
                >
                  <Camera className="h-4 w-4" />
                  Launch Camera Stream
                </button>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Current Detection HUD Pill */}
          {detections.length > 0 && (
            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              {detections.map((det, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                      det.status === 'MATCH'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : det.status === 'UNKNOWN'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {det.status === 'MATCH' ? (
                      <UserCheck className="h-5 w-5" />
                    ) : det.status === 'UNKNOWN' ? (
                      <UserX className="h-5 w-5" />
                    ) : (
                      <ShieldAlert className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {det.status === 'MATCH'
                        ? det.student?.name
                        : det.status === 'UNKNOWN'
                        ? 'Unregistered Person'
                        : det.status}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      {det.student && (
                        <span className="font-mono text-blue-400 font-semibold">
                          {det.student.roll_number}
                        </span>
                      )}
                      <span>Cosine Conf: {Math.round(det.confidence * 100)}%</span>
                      <span>Liveness: {Math.round(det.liveness_score * 100)}%</span>
                    </div>
                  </div>

                  {det.attendance && (
                    <span
                      className={`ml-auto px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        det.attendance === 'MARKED'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {det.attendance === 'MARKED' ? 'ATTENDANCE MARKED' : 'ALREADY MARKED'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Activity Feed (1 col) */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col h-full space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" />
              Today's Live Activity
            </h2>
            <button
              onClick={loadRecent}
              className="p-1 rounded text-slate-400 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[480px]">
            {recentLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No attendance records marked yet today. Start camera to verify students.
              </div>
            ) : (
              recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-medium text-white">{log.student_name || 'Student'}</div>
                    <div className="text-slate-400 font-mono text-[11px]">
                      {log.roll_number} &bull; {log.attendance_time}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                      <ShieldCheck className="h-3 w-3" />
                      {Math.round(log.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
