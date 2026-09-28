import React, { useEffect, useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { registerStudent } from '../api/client';
import { Card, ErrorNote, Field, PageHeader, button } from '../components/ui';
import { BRANCHES, SEMESTERS } from '../lib/constants';
import type { Student } from '../types';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface Photo {
  src: string; // data URL for preview (and upload, for camera captures)
  file?: File;
  mirrored: boolean; // camera previews are shown mirrored; the uploaded image never is
}

export function RegisterStudent() {
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [semester, setSemester] = useState(1);

  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Student | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (mode !== 'camera') return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false })
      .then((stream) => {
        // The effect may have been cleaned up while we waited for permission
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => !cancelled && setCameraError('Could not open the camera. Allow access, or upload a photo instead.'));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [mode]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setPhoto({ src: canvas.toDataURL('image/jpeg', 0.92), mirrored: true });
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) return setError('That image is larger than 10 MB.');
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPhoto({ src: reader.result as string, file, mirrored: false });
    reader.readAsDataURL(file);
  };

  const switchMode = (m: 'camera' | 'upload') => {
    setMode(m);
    setPhoto(null);
    setCameraError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) return;
    setSaving(true);
    setError(null);
    setAdded(null);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('roll_number', roll.trim().toUpperCase());
      fd.append('branch', branch.trim());
      fd.append('semester', String(semester));
      if (photo.file) fd.append('image', photo.file);
      else fd.append('image_base64', photo.src);

      setAdded(await registerStudent(fd));
      // Keep branch & semester: students are usually enrolled a class at a time
      setName('');
      setRoll('');
      setPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the student.');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = name.trim().length >= 2 && roll.trim() && branch.trim().length >= 2 && photo && !saving;

  return (
    <>
      <PageHeader title="Add student" subtitle="Enter the student's details and take a clear, front-facing photo.">
        <a href="#students" className={button.secondary}>
          Back to students
        </a>
      </PageHeader>

      {added && (
        <div role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Added <strong>{added.name}</strong> ({added.roll_number}). You can add the next student now.
        </div>
      )}
      {error && <ErrorNote message={error} />}

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-5">
        <Card title="Details" className="lg:col-span-2">
          <div className="space-y-4 p-4">
            <Field label="Full name">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} className="w-full" autoComplete="off" />
            </Field>
            <Field label="Roll number">
              <input
                type="text"
                value={roll}
                onChange={(e) => setRoll(e.target.value)}
                required
                maxLength={50}
                className="w-full font-mono uppercase"
                autoComplete="off"
              />
            </Field>
            <Field label="Branch">
              <input type="text" list="branches" value={branch} onChange={(e) => setBranch(e.target.value)} required minLength={2} maxLength={100} className="w-full" />
              <datalist id="branches">
                {BRANCHES.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Semester">
              <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className="w-full">
                {SEMESTERS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" disabled={!canSubmit} className={`${button.primary} w-full`}>
              {saving ? 'Saving…' : 'Add student'}
            </button>
            {!photo && <p className="text-center text-xs text-stone-500">A photo is required.</p>}
          </div>
        </Card>

        <Card
          title="Photo"
          className="lg:col-span-3"
          action={
            <div className="flex rounded-md border border-stone-300 p-0.5 text-xs" role="group" aria-label="Photo source">
              {(['camera', 'upload'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded px-2.5 py-1 font-medium ${mode === m ? 'bg-stone-800 text-white' : 'text-stone-600 hover:text-stone-900'}`}
                >
                  {m === 'camera' ? 'Camera' : 'Upload'}
                </button>
              ))}
            </div>
          }
        >
          <div className="space-y-3 p-4">
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-stone-900">
              {mode === 'camera' && (
                <video ref={videoRef} playsInline muted className={`h-full w-full -scale-x-100 object-cover ${photo ? 'hidden' : ''}`} />
              )}
              {photo && (
                <img src={photo.src} alt="Student photo preview" className={`h-full w-full object-contain ${photo.mirrored ? '-scale-x-100' : ''}`} />
              )}
              {mode === 'camera' && !photo && !cameraError && (
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[62%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-white/50" />
              )}
              {mode === 'camera' && cameraError && <p className="absolute px-6 text-center text-sm text-stone-300">{cameraError}</p>}
              {mode === 'upload' && !photo && (
                <label className={`${button.secondary} cursor-pointer`}>
                  <Upload className="h-4 w-4" />
                  Choose photo
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} />
                </label>
              )}
            </div>

            {photo ? (
              <button type="button" onClick={() => setPhoto(null)} className={`${button.secondary} w-full`}>
                {mode === 'camera' ? 'Retake' : 'Choose a different photo'}
              </button>
            ) : (
              mode === 'camera' && (
                <button type="button" onClick={capture} disabled={!!cameraError} className={`${button.secondary} w-full`}>
                  <Camera className="h-4 w-4" />
                  Take photo
                </button>
              )
            )}
            <p className="text-xs text-stone-500">
              One person in frame, face the camera directly, good even lighting, no sunglasses or mask.
            </p>
          </div>
        </Card>
      </form>
    </>
  );
}
