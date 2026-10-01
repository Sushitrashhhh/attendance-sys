import { useEffect, useRef, useState } from 'react';
import { Camera, FlipHorizontal } from 'lucide-react';
import { fetchOverview, fetchTodayAttendance, liveSocketUrl, recognizeImage } from '../api/client';
import { LecturePicker } from '../components/LecturePicker';
import { Card, EmptyState, ErrorNote, LateTag, MethodTag, PageHeader, button } from '../components/ui';
import { fmtTime, pct } from '../lib/format';
import { lectureTime } from '../lib/lectures';
import { useData } from '../lib/useData';
import { useLectureChoice } from '../lib/useLectureChoice';
import type { RecognitionResult } from '../types';

const CAPTURE_WIDTH = 400; // frames are downscaled to this width (aspect ratio kept) before upload
const REPLY_TIMEOUT_MS = 3000; // give up on a lost reply and send the next frame

const COLORS: Partial<Record<RecognitionResult['status'], string>> = {
  MATCH: '#16a34a',
  UNKNOWN: '#d97706',
  LIVENESS_FAILED: '#dc2626',
};
const CHALLENGE_COLOR = '#2563eb';
const NOT_IN_CLASS_COLOR = '#78716c';

const faceColor = (f: RecognitionResult) =>
  f.attendance === 'CHALLENGE'
    ? CHALLENGE_COLOR
    : f.attendance === 'NOT_IN_CLASS'
      ? NOT_IN_CLASS_COLOR
      : (COLORS[f.status] ?? '#57534e');

const turnWord = (f: RecognitionResult) => (f.challenge === 'turn_left' ? 'left' : 'right');

interface Frame {
  faces: RecognitionResult[];
  w: number; // capture size the bboxes refer to
  h: number;
}

function boxLabel(f: RecognitionResult) {
  if (f.attendance === 'CHALLENGE') return `${f.student?.name ?? 'Student'}: turn ${turnWord(f)}`;
  if (f.status === 'MATCH') return `${f.student?.name ?? 'Student'} · ${pct(f.confidence)}`;
  if (f.status === 'UNKNOWN') return 'Not recognised';
  if (f.status === 'LIVENESS_FAILED') return 'Liveness check failed';
  return f.status;
}

function describe(f: RecognitionResult) {
  if (f.attendance === 'CHALLENGE') return `Turn your head to your ${turnWord(f)}`;
  if (f.status === 'MATCH') {
    if (f.attendance === 'MARKED') return f.attendance_status === 'late' ? 'Marked late' : 'Marked present';
    if (f.attendance === 'ALREADY_MARKED') return 'Already marked';
    if (f.attendance === 'NOT_IN_CLASS') return "Not in this lecture's class";
    if (f.attendance === 'CHALLENGE_FAILED') return 'Head turn not detected, try again in a moment';
    return 'Recognised';
  }
  if (f.status === 'UNKNOWN') return 'Not registered, or the face is not clear enough';
  if (f.status === 'LIVENESS_FAILED') return f.message || 'Looks like a photo or a screen';
  return f.message || f.status;
}

export function LiveAttendance() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [rate, setRate] = useState(0);
  const [link, setLink] = useState<'connecting' | 'ws' | 'http'>('connecting');
  const [mirrored, setMirrored] = useState(false);
  const [headTurn, setHeadTurn] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const choice = useLectureChoice();
  const { lectureId, lecture } = choice;
  // Read by the frame loop on every send, so changing these never restarts the camera
  const settings = useRef({ lectureId, headTurn });
  useEffect(() => {
    settings.current = { lectureId, headTurn };
  }, [lectureId, headTurn]);

  const today = useData(() => Promise.all([fetchOverview(lectureId), fetchTodayAttendance(lectureId)]), [lectureId], 20000);
  const reloadToday = today.reload;

  const start = async () => {
    setError(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      setActive(true);
    } catch {
      setError('Could not open the camera. Allow camera access in your browser and try again.');
    }
  };

  // Camera + recognition loop. Runs while active; the cleanup stops everything.
  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;

    video.srcObject = streamRef.current;
    video.play().catch(() => {});

    const canvas = document.createElement('canvas');
    let closed = false;
    let raf = 0;
    let waitingSince = 0; // 0 = not waiting for a reply
    let pending = { w: 0, h: 0 };
    let replies = 0;
    let rateWindowStart = performance.now();

    const handle = (faces: RecognitionResult[]) => {
      waitingSince = 0;
      replies++;
      setFrame({ faces: faces.filter((f) => f.bbox), w: pending.w, h: pending.h });
      if (faces.some((f) => f.attendance === 'MARKED')) reloadToday();
    };

    setLink('connecting');
    const ws = new WebSocket(liveSocketUrl());
    ws.onopen = () => setLink('ws');
    ws.onmessage = (ev) => {
      try {
        handle(JSON.parse(ev.data).faces ?? []);
      } catch {
        waitingSince = 0;
      }
    };
    ws.onclose = () => {
      waitingSince = 0;
      if (!closed) setLink('http');
    };

    const tick = () => {
      if (closed) return;
      const now = performance.now();
      if (now - rateWindowStart >= 1000) {
        setRate(Math.round((replies * 1000) / (now - rateWindowStart)));
        replies = 0;
        rateWindowStart = now;
      }
      if (waitingSince && now - waitingSince > REPLY_TIMEOUT_MS) waitingSince = 0;

      const ready = video.readyState >= 2 && video.videoWidth > 0;
      if (!waitingSince && ready && ws.readyState !== WebSocket.CONNECTING) {
        const w = CAPTURE_WIDTH;
        const h = Math.round((CAPTURE_WIDTH * video.videoHeight) / video.videoWidth);
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
        const image = canvas.toDataURL('image/jpeg', 0.75);
        pending = { w, h };
        waitingSince = now;

        const { lectureId: lecture_id, headTurn: challenge } = settings.current;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ image, auto_mark: true, lecture_id, challenge }));
        } else {
          // The head-turn check needs the live connection; without it, only recognise, never mark
          recognizeImage(image, !challenge, lecture_id)
            .then((r) => !closed && handle([r]))
            .catch(() => {
              waitingSince = 0;
            });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      closed = true;
      cancelAnimationFrame(raf);
      ws.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      video.srcObject = null;
      setFrame(null);
      setRate(0);
    };
  }, [active, reloadToday]);

  // Draw face boxes. The video uses object-contain, so map capture coords through the same letterboxing.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const W = overlay.clientWidth;
    const H = overlay.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    overlay.width = W * dpr;
    overlay.height = H * dpr;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!frame || !frame.w) return;

    const s = Math.min(W / frame.w, H / frame.h);
    const offX = (W - frame.w * s) / 2;
    const offY = (H - frame.h * s) / 2;
    ctx.font = '500 13px "IBM Plex Sans", system-ui, sans-serif';
    ctx.lineWidth = 2;

    for (const f of frame.faces) {
      const [bx, by, bw, bh] = f.bbox!;
      const w = bw * s;
      const h = bh * s;
      const y = offY + by * s;
      const x = mirrored ? W - (offX + (bx + bw) * s) : offX + bx * s;
      const color = faceColor(f);

      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);

      const label = boxLabel(f);
      const labelW = ctx.measureText(label).width + 12;
      const labelY = y >= 22 ? y - 22 : y + h;
      ctx.fillStyle = color;
      ctx.fillRect(x - 1, labelY, labelW, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x + 5, labelY + 15);
    }
  }, [frame, mirrored]);

  const [overview, records] = today.data ?? [null, []];
  const faces = frame?.faces ?? [];
  const prompt = faces.find((f) => f.attendance === 'CHALLENGE');

  return (
    <>
      <PageHeader
        title="Take attendance"
        subtitle="Students are marked present automatically when the camera recognises them."
      >
        <LecturePicker lectures={choice.lectures} value={lectureId} onChange={choice.choose} />
        <label className="flex items-center gap-2 text-sm text-stone-600" title="Ask each student to turn their head before marking. Stops photos and phone screens.">
          <input type="checkbox" checked={headTurn} onChange={(e) => setHeadTurn(e.target.checked)} className="accent-accent" />
          Head-turn check
        </label>
        {active ? (
          <>
            <button className={button.secondary} onClick={() => setMirrored((m) => !m)} aria-pressed={mirrored}>
              <FlipHorizontal className="h-4 w-4" />
              {mirrored ? 'Mirrored' : 'Mirror view'}
            </button>
            <button className={button.secondary} onClick={() => setActive(false)}>
              Stop camera
            </button>
          </>
        ) : (
          <button className={button.primary} onClick={start}>
            <Camera className="h-4 w-4" />
            Start camera
          </button>
        )}
      </PageHeader>

      {error && <ErrorNote message={error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone-900">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-contain ${mirrored ? '-scale-x-100' : ''} ${active ? '' : 'invisible'}`}
            />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            {prompt && (
              <div role="status" className="absolute inset-x-0 bottom-4 mx-auto w-fit max-w-[90%] rounded-md bg-white/95 px-4 py-2 text-center text-lg font-medium text-stone-900 shadow">
                {prompt.student?.name}, turn your head to your <strong>{turnWord(prompt)}</strong>
              </div>
            )}
            {!active && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-stone-400">Camera is off</p>
                <button className={button.primary} onClick={start}>
                  <Camera className="h-4 w-4" />
                  Start camera
                </button>
              </div>
            )}
          </div>

          {active && (
            <p className="flex items-center gap-2 text-xs text-stone-500">
              <span className={`h-2 w-2 rounded-full ${link === 'connecting' ? 'bg-stone-300' : 'bg-emerald-500'}`} />
              {link === 'connecting' ? 'Connecting…' : `${rate} frame${rate === 1 ? '' : 's'}/s`}
              {link === 'http' &&
                (headTurn
                  ? ' · live connection unavailable: recognising only, not marking (head-turn check needs it)'
                  : ' · live connection unavailable, using slower fallback')}
            </p>
          )}

          {active && (
            <Card title="In view">
              {faces.length === 0 ? (
                <EmptyState>No faces in view. Stand about an arm's length from the camera.</EmptyState>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {faces.map((f, i) => (
                    <li key={f.student?.id ?? `u${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: faceColor(f) }} />
                      <span className="font-medium">
                        {f.student ? f.student.name : 'Unknown person'}
                        {f.student && <span className="ml-2 font-mono text-xs font-normal text-stone-500">{f.student.roll_number}</span>}
                      </span>
                      <span className="ml-auto text-right text-stone-500">{describe(f)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <div className="text-sm text-stone-500">
              {lecture ? `Present in ${lecture.subject} (${lectureTime(lecture)})` : 'Present today'}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {overview ? overview.present_today : '–'}
              <span className="text-base font-normal text-stone-400"> / {overview ? overview.total_students : '–'}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${overview?.total_students ? (overview.present_today / overview.total_students) * 100 : 0}%` }}
              />
            </div>
          </Card>

          <Card title="Latest check-ins" action={<a href="#overview" className="text-xs text-accent hover:underline">See all</a>}>
            {records.length === 0 ? (
              <EmptyState>No check-ins yet today.</EmptyState>
            ) : (
              <ul className="max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
                {records.slice(0, 12).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.student_name}</div>
                      <div className="font-mono text-xs text-stone-500">{r.roll_number}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <LateTag status={r.status} />
                      {r.method === 'manual' && <MethodTag method="manual" />}
                      <span className="font-mono text-xs text-stone-500">{fmtTime(r.attendance_time)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
