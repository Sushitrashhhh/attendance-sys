import React, { useState, useRef, useEffect } from 'react';
import {
  UserPlus,
  Camera,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { registerStudent } from '../api/client';
import type { Student } from '../types';

interface RegisterStudentProps {
  onSuccess?: (student: Student) => void;
}

export const RegisterStudent: React.FC<RegisterStudentProps> = ({ onSuccess }) => {
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [branch, setBranch] = useState('Computer Science');
  const [semester, setSemester] = useState(6);

  // Capture mode: 'webcam' or 'upload'
  const [mode, setMode] = useState<'webcam' | 'upload'>('webcam');
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successStudent, setSuccessStudent] = useState<Student | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Start webcam
  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setError('Unable to access webcam. Please check browser permissions or upload an image.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (mode === 'webcam') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [mode]);

  // Capture frame from webcam
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCapturedImage(dataUrl);
      setSelectedFile(null);
    }
  };

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
    setSelectedFile(null);
    setError(null);
    if (mode === 'webcam' && !cameraActive) {
      startCamera();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter student name.');
      return;
    }
    if (!rollNumber.trim()) {
      setError('Please enter roll number.');
      return;
    }
    if (!capturedImage && !selectedFile) {
      setError('Please capture or upload a facial enrollment image.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('roll_number', rollNumber.trim().toUpperCase());
      formData.append('branch', branch.trim());
      formData.append('semester', semester.toString());

      if (selectedFile) {
        formData.append('image', selectedFile);
      } else if (capturedImage) {
        formData.append('image_base64', capturedImage);
      }

      const registered = await registerStudent(formData);
      setSuccessStudent(registered);
      if (onSuccess) onSuccess(registered);
      // Clean up form
      setName('');
      setRollNumber('');
      setCapturedImage(null);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
          <UserPlus className="h-6 w-6 text-blue-400" />
          <span>Biometric Student Registration</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Capture high-fidelity facial features, compute 512-D ArcFace normalized embeddings, and index into Neon pgvector.
        </p>
      </div>

      {successStudent && (
        <div className="glass-panel p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Enrollment Successful!</h3>
              <p className="text-xs text-emerald-300">
                Student {successStudent.name} ({successStudent.roll_number}) enrolled with 512-D ArcFace vector in Neon pgvector.
              </p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setSuccessStudent(null)}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            >
              Enroll Another Student
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Form Card */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800 space-y-4">
          <h2 className="text-base font-semibold text-white">Student Information</h2>
          <form className="space-y-4 text-sm" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priyankar Sharma"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Roll Number</label>
              <input
                type="text"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. 2026CS101"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm uppercase font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Branch / Dept</label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="Computer Science">Computer Science</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="Civil">Civil</option>
                  <option value="Data Science">Data Science</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-blue-500 text-sm"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Semester {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || (!capturedImage && !selectedFile)}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${
                  loading || (!capturedImage && !selectedFile)
                    ? 'bg-blue-600/40 text-slate-400 cursor-not-allowed border border-blue-500/20'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25'
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    <span>Extracting ArcFace 512-D Embedding...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Complete Enrollment</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Biometric Capture Card */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Biometric Face Enrollment</h2>
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode('webcam')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  mode === 'webcam' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Webcam
              </button>
              <button
                type="button"
                onClick={() => setMode('upload')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  mode === 'upload' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Upload
              </button>
            </div>
          </div>

          {/* Viewport */}
          <div className="relative aspect-video rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
            {capturedImage ? (
              <div className="relative w-full h-full">
                <img
                  src={capturedImage}
                  alt="Captured face preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shadow-md">
                  <CheckCircle2 className="h-3 w-3" />
                  Captured
                </div>
              </div>
            ) : mode === 'webcam' ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
                {/* Visual Face Oval Target */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-60 border-2 border-blue-500/50 border-dashed rounded-full animate-pulse flex items-center justify-center">
                    <span className="text-[11px] text-blue-300 font-medium bg-slate-950/60 px-2 py-0.5 rounded-full">
                      Align face here
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center space-y-3">
                <Upload className="h-10 w-10 text-slate-500 mx-auto" />
                <div className="text-xs text-slate-400">Select a frontal face portrait</div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-medium text-white hover:bg-slate-800">
                  <span>Browse File</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Capture / Retake Controls */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {capturedImage ? (
              <button
                type="button"
                onClick={resetCapture}
                className="w-full py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retake Photo</span>
              </button>
            ) : mode === 'webcam' ? (
              <button
                type="button"
                onClick={capturePhoto}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-md shadow-blue-600/20"
              >
                <Camera className="h-4 w-4" />
                <span>Capture Snapshot</span>
              </button>
            ) : null}
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span>YuNet automatically aligns eyes & mouth; ArcFace produces normalized vector.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
