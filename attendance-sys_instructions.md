# Attendance System — Daughter Instructions & Architecture Reference

Project-specific instructions, conventions, and operational context for the `attendance-sys` codebase.

---

## 1. System Overview & Architecture

An enterprise-grade, real-time facial recognition attendance platform leveraging Neon Serverless PostgreSQL with `pgvector`, OpenCV YuNet detection, and ArcFace ResNet-50 embeddings.

### Core Stack
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, OpenCV DNN, ONNX Runtime (`onnxruntime`), pgvector-python.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts (Reports page only, lazy-loaded). Plain `fetch`, no Axios.
- **Database**: Neon Serverless PostgreSQL (`pgvector` extension for cosine distance queries `<=>`).
- **Vision Pipeline**:
  - Face Detection: OpenCV YuNet (320x320 dynamic size, 5 landmarks).
  - Normalization: 5-point affine transformation aligning coordinates to standard 112x112 canonical format.
  - Embeddings: ArcFace ResNet-50 (`w600k_r50.onnx`) generating 512-D L2-normalized vectors.
  - Anti-Spoofing: Passive multi-factor analysis (Laplacian variance texture, YCrCb skin chrominance gamut clustering, dynamic reflectance gradients).

---

## 2. Directory Layout

```text
attendance sys/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI endpoints (health, students, attendance, analytics, recognition)
│   │   ├── cv/               # Computer vision pipeline (detector, embedder, liveness, preprocessing, pipeline)
│   │   ├── db/               # SQLAlchemy engine, models, Alembic migrations (db/migrations/versions)
│   │   ├── repositories/     # DB queries, pgvector cosine distance operations
│   │   ├── schemas/          # Pydantic schemas (request/response validation)
│   │   ├── services/         # Business coordination layer
│   │   ├── config.py         # Pydantic settings management
│   │   └── main.py           # FastAPI entrypoint, middleware, WebSocket routes
│   ├── tests/                # Pytest unit and integration test suite
│   ├── requirements.txt      # Python dependencies
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/              # fetch client and typed endpoint methods
│   │   ├── components/       # Sidebar + shared primitives in ui.tsx (Card, PageHeader, Modal, Pager, button/table classes)
│   │   ├── lib/              # format helpers, constants (BRANCHES, LOW_ATTENDANCE), useData hook
│   │   ├── pages/            # View pages (LiveAttendance, RegisterStudent, Dashboard, etc.)
│   │   └── types/            # TypeScript data contracts
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── models/                   # ONNX weight assets (YuNet, ArcFace)
│   └── .gitkeep
├── scripts/
│   └── download_models.py    # Model weights download script
├── docker-compose.yml        # Multi-container orchestration
└── .env.example              # Template environment configuration
```

---

## 3. Engineering Guidelines & Conventions

- **Biometric Security**: Raw biometric face vectors (512-D floats) are never returned in public frontend API responses.
- **Idempotency**: One attendance record per student per date per lecture, enforced by the unique index `uq_attendance_student_date_lecture` (`NULLS NOT DISTINCT`, so the whole-day record with `lecture_id` NULL is unique too; needs Postgres 15+). Any "present" count must count *distinct students*, since a student can have several records on one date.
- **Vector Search**: Always use cosine distance `<=>` operator via pgvector for normalized ArcFace embeddings.
- **Model Storage**: Model files (`*.onnx`) are excluded from Git due to file size limits. Always run `python scripts/download_models.py` when configuring a fresh environment.
- **Git Hygiene**: Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`). Never commit `.env` or assistant metadata.
- **Migrations**: Any model change ships with a new Alembic revision in `backend/app/db/migrations/versions/`. Remind the user to run `alembic upgrade head` after pulling.
- **Attendance `method`**: `face` (camera) or `manual` (marked from the dashboard). Manual records store `confidence = liveness_score = 0` and are excluded from anomaly checks; the UI shows "–" for their scores.
- **Lectures**: `lectures` is a weekly timetable (weekday 0 = Monday). Removing one sets `active = false` so history keeps its subject. `status` is `present` or `late`; late counts as attended in percentages. Branch/semester on a lecture restrict who can be marked (`services/attendance_rules.py`).
- **Head-turn challenge**: lives in `services/live_session.py` (per WebSocket connection). A turned face is followed by position, not identity. Only 5 YuNet landmarks exist, so blinking can't be detected without a different landmark model.
- **Learned faces**: `face_samples` holds up to 10 extra embeddings per student, added only on a new confident mark (see `LEARN_*` constants in `services/recognition_service.py`). `StudentRepository.match` takes the best over enrollment + samples and returns the runner-up score.
- **Failed checks & excusals**: `failed_checks` gets a row per timed-out head-turn challenge (`FAILED_CHECKS_TO_FLAG` = 3 per day flags it). `excusals` are inclusive date ranges; excused, un-attended class days are removed from the report denominator and excused students are left out of absent-today counts. The 75% minimum lives in `attendance_rules.MIN_ATTENDANCE_PERCENT` and `LOW_ATTENDANCE` in the frontend; keep them equal.
- **Self-check** (`/api/analytics/self-check/{roll}`) has no authentication: anyone who knows a roll number can see that student's attendance.
- **Live WebSocket contract**: the client sends one frame and waits for the reply. The server must answer every frame exactly once (delay to rate-limit, never drop), or the client stalls.

---

## 4. UI Conventions

The UI was deliberately redesigned (2026-09-28) to look like a plain, practical tool rather than a generated "AI dashboard". Keep it that way:

- Light theme only: `stone` neutrals, a single accent `accent` (#0f6e58, defined in `tailwind.config.js`), red/amber only for real problems. No gradients, glassmorphism, glows, pulsing dots, or dark "HUD" styling.
- Plain-English copy aimed at a teacher ("Take attendance", "Not marked yet"). Do not surface model names, vector dimensions, or database vendor names in the UI.
- Reuse `components/ui.tsx` primitives and `lib/useData.ts` for loading data instead of hand-rolled fetch/loading state.
- Pages are addressed by URL hash (`#overview`, `#live`, `#students`, `#register`, `#records`, `#reports`, `#flags`); link with `<a href="#...">`.
- Fonts: IBM Plex Sans / IBM Plex Mono (roll numbers and times use mono).
