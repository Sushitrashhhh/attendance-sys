# AI-Powered Face Recognition Attendance System

[![Python](https://img.shields.io/badge/Python-3.12%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Neon PostgreSQL](https://img.shields.io/badge/Neon-pgvector-00E599?logo=postgresql&logoColor=black)](https://neon.tech/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.18%2B-005CED?logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![OpenCV](https://img.shields.io/badge/OpenCV-YuNet-5C3EE8?logo=opencv&logoColor=white)](https://opencv.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An enterprise-grade, real-time biometric attendance platform combining deep learning computer vision, native sub-millisecond vector similarity search, passive multi-factor anti-spoofing liveness verification, and a modern telemetry dashboard.

---

## Architecture & Data Flow

```text
                               +----------------------------------------------------+
                               |                   Browser Client                   |
                               |  React 19 + TypeScript + Tailwind CSS (Vite / HUD) |
                               +-------------------------+--------------------------+
                                                         |
                                         HTTP REST / Bidirectional WebSocket
                                         (/ws/live-attendance, ~5 frames/s)
                                                         |
                                                         v
                               +----------------------------------------------------+
                               |             FastAPI Application Gateway            |
                               |    Uvicorn ASGI Server • CORS & Rate Limiting      |
                               +-------------------------+--------------------------+
                                                         |
                               +-------------------------v--------------------------+
                               |              Computer Vision Pipeline              |
                               |                                                    |
                               |  1. Frame Capture (Decoded BGR)                    |
                               |  2. OpenCV YuNet DNN Detector (320x320)            |
                               |  3. 5-Point Affine Landmark Alignment (112x112)   |
                               |  4. ArcFace ResNet-50 (512-D L2 Embedding)         |
                               |  5. Multi-Factor Passive Anti-Spoofing Liveness   |
                               +-------------------------+--------------------------+
                                                         |
                               +-------------------------v--------------------------+
                               |                Service & DB Layer                  |
                               |  RecognitionService • AttendanceService (SQLAlchemy)|
                               +-------------------------+--------------------------+
                                                         |
                                                 Cosine Distance (<=>)
                                                         |
                                                         v
                               +----------------------------------------------------+
                               |            Neon Serverless PostgreSQL              |
                               |                 (pgvector extension)               |
                               |                                                    |
                               |  - students (id, roll_no, name, embedding VECTOR)  |
                               |  - attendance (id, student_id, date, status)       |
                               |  - UNIQUE(student_id, attendance_date)             |
                               +----------------------------------------------------+
```

---

## Key Capabilities

- **Real-Time Landmark Localization**: OpenCV YuNet lightweight deep neural network detecting faces and 5 canonical facial landmarks at low inference latency.
- **Canonical Affine Alignment**: Euclidean partial affine transformation aligning detected faces to standard 112×112 coordinate space, invariant to roll, pitch, and scale.
- **512-Dimensional Deep Biometrics**: ArcFace ResNet-50 (`w600k_r50.onnx`) deep neural network generating unit-normalized (L2 norm = 1.0) feature vectors with high inter-class variance.
- **Vector Search**: Direct execution of cosine distance queries (`<=>`) via PostgreSQL's `pgvector` extension hosted on Neon Serverless Postgres.
- **Passive Multi-Factor Anti-Spoofing**:
  - **High-Frequency Texture Analysis**: Laplacian variance blur and frequency filtering to detect low-res screen rerenderings.
  - **YCrCb Skin Gamut Clustering**: Elliptical chrominance thresholding filtering non-skin artifacts.
  - **Luminance Variation**: Brightness spread across the face; flat prints and screens tend to score low.
- **Strict Idempotency Ledger**: Guaranteed duplicate prevention via database-level `UNIQUE(student_id, attendance_date)` constraints.
- **Bidirectional Live Stream HUD**: WebSocket pipeline streaming bounded HUD coordinates, real-time recognition confidence, and status feedback to client cameras.
- **Explainable Anomaly Telemetry**: Heuristic flags detecting borderline recognition thresholds, questionable liveness metrics, and off-hour attendance anomalies.
- **Teacher-facing dashboard**: who is present / not yet marked today, one-click manual marking and undo, per-student attendance percentage with a below-75% filter, date-range search and full CSV export, and a review list for suspicious camera check-ins.
- **Duplicate-face protection**: enrolling a face that already matches an existing student is refused.
- **Head-turn liveness challenge**: before marking, the live camera asks the student to turn their head left or right (chosen at random). The check compares the nose's offset from the eye midpoint to the eye spacing; a flat photo or phone screen rotated in front of the camera keeps that ratio constant, so it can't pass. The threshold is `TURN_THRESHOLD` in `backend/app/services/live_session.py`.
- **Recognition that adapts over time**: after a confident, live check-in, that scan is stored as an extra face reference (max 10 per student, only when the match clearly beats every other student). Matching uses the best of the enrollment photo and these samples, so a new beard or glasses doesn't break recognition. Teachers can reset them per student.
- **Proxy-attempt flags**: every timed-out head-turn check is logged; 3 or more for one student on one day shows up under Flagged scans as a possible proxy attempt (with whether they later checked in), which the teacher can dismiss.
- **Excused absences**: medical / leave / college-event date ranges per student. Excused class days are left out of attendance percentages and the student drops off the "not marked" list.
- **Student self-check**: a student enters their roll number to see overall and per-subject attendance, plus how many classes they can still miss (or must attend in a row) to stay at 75%.
- **Lecture-wise attendance with late marking**: a weekly timetable (subject, day, time, optional branch/semester, late cutoff). Take attendance auto-selects the lecture running now, only marks students in that class, and marks arrivals after the cutoff as late. Reports show attendance % per subject.

---

## Repository Structure

```text
attendance-sys/
├── backend/
│   ├── app/
│   │   ├── api/              # API endpoints (health, students, attendance, analytics, recognition)
│   │   ├── cv/               # Vision pipeline (YuNet detector, ArcFace embedder, liveness, alignment)
│   │   ├── db/               # SQLAlchemy engine, ORM models, Alembic migrations (db/migrations)
│   │   ├── repositories/     # Data access layer and pgvector query abstractions
│   │   ├── schemas/          # Pydantic schemas (typed request/response validation)
│   │   ├── services/         # Business domain services
│   │   ├── config.py         # Application settings via pydantic-settings
│   │   └── main.py           # FastAPI entrypoint, middleware, and WebSocket routes
│   ├── tests/                # Automated pytest suite
│   ├── Dockerfile            # Production container configuration for backend
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── api/              # fetch-based typed API client
│   │   ├── components/       # Sidebar and shared UI primitives (ui.tsx)
│   │   ├── lib/              # Formatting helpers, constants, useData hook
│   │   ├── pages/            # Overview, Take attendance, Students, Add student, Records, Reports, Flagged scans
│   │   └── types/            # TypeScript data model contracts
│   ├── Dockerfile            # Multi-stage production container build (Vite + Nginx)
│   ├── nginx.conf            # Reverse proxy and single-page routing configuration
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── models/                   # Local directory for ONNX neural network weights
│   └── .gitkeep
├── scripts/
│   └── download_models.py    # Automated weights downloader for YuNet & ArcFace
├── docker-compose.yml        # Multi-container orchestration (Backend + Frontend)
├── .env.example              # Environment variable template
└── README.md
```

---

## Environment Configuration

Create a `.env` file in the project root based on `.env.example`:

```bash
cp .env.example .env
```

| Variable                  | Description                                                 | Example / Default                                                            |
| :------------------------ | :---------------------------------------------------------- | :--------------------------------------------------------------------------- |
| `DATABASE_URL`          | Neon PostgreSQL pooled connection string                    | `postgresql://user:pass@ep-pooler.region.neon.tech/neondb?sslmode=require` |
| `DATABASE_URL_UNPOOLED` | Neon PostgreSQL direct unpooled connection (for migrations) | `postgresql://user:pass@ep.region.neon.tech/neondb?sslmode=require`        |
| `CORS_ORIGINS`          | Comma-separated list of allowed origins                     | `http://localhost:5173,http://localhost:80`                                |
| `RECOGNITION_THRESHOLD` | Cosine similarity threshold for matching identity           | `0.65`                                                                     |
| `LIVENESS_THRESHOLD`    | Minimum aggregate anti-spoofing score                       | `0.70`                                                                     |
| `APP_ENV`               | Environment state (`development`, `production`)         | `development`                                                              |

---

## Setup & Installation

### 1. Pretrained Model Weights

Download the face detection and ArcFace feature extraction weights:

```bash
python scripts/download_models.py
```

This places the following models inside `models/`:

- `face_detection_yunet_2023mar.onnx` (~232 KB)
- `w600k_r50.onnx` (~166 MB)

### 2. Backend Setup

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
alembic upgrade head   # re-run after pulling: new migrations live in app/db/migrations/versions
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- API Base: `http://127.0.0.1:8000`
- Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`
- Health Endpoint: `http://127.0.0.1:8000/health`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

- Web UI: `http://localhost:5173`

---

## Deployment with Docker Compose

Deploy the complete stack in isolated containers:

```bash
docker-compose up --build
```

- Web Application: `http://localhost:80`
- API Gateway: `http://localhost:8000`

---

## API & WebSocket Reference

### REST Endpoints

| Method   | Endpoint                          | Description                                                          |
| :------- | :-------------------------------- | :------------------------------------------------------------------- |
| `GET`    | `/health`                         | Service and database health                                          |
| `POST`   | `/api/students`                   | Enroll a student (form fields + photo); rejects duplicate faces      |
| `GET`    | `/api/students`                   | List students (`search`, `skip`, `limit`)                            |
| `GET`    | `/api/students/{id}`              | One student                                                          |
| `PUT`    | `/api/students/{id}`              | Edit name / roll number / branch / semester                          |
| `DELETE` | `/api/students/{id}`              | Delete a student with their face data and attendance history         |
| `GET`    | `/api/attendance`                 | List records (`search`, `date_from`, `date_to`, `lecture_id`, `skip`, `limit`) |
| `GET`    | `/api/attendance/export`          | CSV of every record matching `search` / `date_from` / `date_to`      |
| `GET`    | `/api/attendance/today`           | Today's check-ins                                                    |
| `GET`    | `/api/attendance/absent-today`    | Students not yet marked today                                        |
| `POST`   | `/api/attendance/mark`            | Mark by hand: `{"student_id": 1, "lecture_id": null}` (late after the lecture's cutoff) |
| `DELETE` | `/api/attendance/{id}`            | Remove a wrongly marked record                                       |
| `GET`    | `/api/attendance/student/{id}`    | One student's full history                                           |
| `GET`    | `/api/lectures`                   | Weekly timetable                                                     |
| `POST`   | `/api/lectures`                   | Add a lecture (subject, weekday 0=Mon, times, branch/semester, cutoff) |
| `DELETE` | `/api/lectures/{id}`              | Remove from timetable (past attendance is kept)                      |
| `DELETE` | `/api/students/{id}/face-samples` | Forget face references learned from live check-ins                   |
| `GET`    | `/api/excusals`                   | Excused absences (`student_id` filter)                               |
| `POST`   | `/api/excusals`                   | Excuse `{"student_id", "date_from", "date_to", "reason"}` (max 180 days) |
| `DELETE` | `/api/excusals/{id}`              | Remove an excused absence                                            |
| `GET`    | `/api/analytics/self-check/{roll}`| A student's overall + per-subject %, can-miss / must-attend, recent check-ins |
| `DELETE` | `/api/analytics/failed-checks`    | Dismiss a proxy-attempt flag (`student_id`, `date`)                  |
| `POST`   | `/api/recognition/test`           | Recognise a single uploaded image (or `image_base64` form field)     |
| `POST`   | `/api/recognition/test-json`      | Same, JSON body `{"image_base64": "...", "auto_mark": true}`         |
| `GET`    | `/api/analytics/overview`         | Enrolled / present / absent counts and today's rate                  |
| `GET`    | `/api/analytics/trends`           | Students present per day for the last `days` (3-90)                  |
| `GET`    | `/api/analytics/students`         | Attendance percentage per student                                    |
| `GET`    | `/api/analytics/distribution`     | Student count per branch                                             |
| `GET`    | `/api/analytics/anomalies`        | Flagged camera check-ins (low confidence, weak liveness, off-hours)  |

### WebSocket Endpoint

```text
WS /ws/live-attendance
```

- **Client Payload**: `{"image": "<base64_jpeg_frame>", "auto_mark": true, "lecture_id": 3, "challenge": true}` (`lecture_id` null = whole day; `challenge` = head-turn check)
- **Server Response** (exactly one reply per frame; the client waits for it before sending the next):

```json
{
  "timestamp": 1727076600.12,
  "faces": [
    {
      "status": "MATCH",
      "student": { "id": 42, "name": "Alex Mercer", "roll_number": "CS-2024-001", "branch": "Computer Science", "semester": 5 },
      "confidence": 0.884,
      "liveness_score": 0.941,
      "attendance": "MARKED",
      "message": null,
      "bbox": [140, 85, 210, 260]
    }
  ]
}
```

`status` is `MATCH`, `UNKNOWN` or `LIVENESS_FAILED`; `attendance` is `MARKED`, `ALREADY_MARKED`, `NOT_IN_CLASS`, `CHALLENGE` (with `challenge`: `turn_left` / `turn_right`), `CHALLENGE_FAILED` or `NOT_APPLICABLE`; once marked, `attendance_status` is `present` or `late`. `/today`, `/absent-today`, `/api/analytics/overview` and `/api/analytics/students` accept `?lecture_id=`. `bbox` is `[x, y, w, h]` in the coordinates of the frame that was sent. Frames are processed at most ~5 per second per connection.

---

## Automated Testing

Run the test suite covering CV components, biometric normalization, anti-spoofing heuristics, the head-turn challenge, lectures, excused absences and API routes:

```bash
cd backend
pytest -q
```

The database tests use the `DATABASE_URL` from `.env` and create (then delete) students whose roll numbers start with `TEST_`.

---

## Security & Biometric Privacy

- **No Face Image Storing**: Raw camera captures and biometric face crops are never permanently written to disk or the relational database.
- **Non-Invertible Embeddings**: Biometric representations are stored solely as 512-dimensional floating-point latent vectors.
- **Client Shielding**: Vector embeddings (`VECTOR(512)`) are explicitly omitted from all public frontend API responses and serialization schemas.
- **SQL Injection Prevention**: All database queries are strictly parameterized via SQLAlchemy ORM and Alembic migrations.

---

## License

This project is licensed under the [MIT License](LICENSE).
