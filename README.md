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
                                         (/ws/live-attendance, 15-30 FPS)
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
- **Sub-Millisecond Vector Search**: Direct execution of cosine distance queries (`<=>`) via PostgreSQL's `pgvector` extension hosted on Neon Serverless Postgres.
- **Passive Multi-Factor Anti-Spoofing**:
  - **High-Frequency Texture Analysis**: Laplacian variance blur and frequency filtering to detect low-res screen rerenderings.
  - **YCrCb Skin Gamut Clustering**: Elliptical chrominance thresholding filtering non-skin artifacts.
  - **Reflectance Gradient Detection**: Specular highlight distribution preventing digital device replay attacks.
- **Strict Idempotency Ledger**: Guaranteed duplicate prevention via database-level `UNIQUE(student_id, attendance_date)` constraints.
- **Bidirectional Live Stream HUD**: WebSocket pipeline streaming bounded HUD coordinates, real-time recognition confidence, and status feedback to client cameras.
- **Explainable Anomaly Telemetry**: Heuristic flags detecting borderline recognition thresholds, questionable liveness metrics, and off-hour attendance anomalies.
- **Modern Responsive Dashboard**: React 19, TypeScript, and Tailwind CSS with instant filtering, CSV export, student onboarding, and attendance analytics.

---

## Repository Structure

```text
attendance-sys/
├── backend/
│   ├── alembic/              # Database migration version scripts
│   ├── app/
│   │   ├── api/              # API endpoints (health, students, attendance, analytics, recognition)
│   │   ├── cv/               # Vision pipeline (YuNet detector, ArcFace embedder, liveness, alignment)
│   │   ├── db/               # SQLAlchemy engine, session lifecycle, and ORM models
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
│   │   ├── api/              # Axios HTTP client with typed API calls
│   │   ├── components/       # UI building blocks (Navbar, Modal, HUD, StatusBadges)
│   │   ├── pages/            # View pages (LiveAttendance, RegisterStudent, Dashboard, Records, Analytics)
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
├── attendance-sys_instructions.md # Project-specific architectural standing instructions
└── README.md
```

---

## Environment Configuration

Create a `.env` file in the project root based on `.env.example`:

```bash
cp .env.example .env
```

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | Neon PostgreSQL pooled connection string | `postgresql://user:pass@ep-pooler.region.neon.tech/neondb?sslmode=require` |
| `DATABASE_URL_UNPOOLED` | Neon PostgreSQL direct unpooled connection (for migrations) | `postgresql://user:pass@ep.region.neon.tech/neondb?sslmode=require` |
| `CORS_ORIGINS` | Comma-separated list of allowed origins | `http://localhost:5173,http://localhost:80` |
| `RECOGNITION_THRESHOLD` | Cosine similarity threshold for matching identity | `0.65` |
| `LIVENESS_THRESHOLD` | Minimum aggregate anti-spoofing score | `0.70` |
| `APP_ENV` | Environment state (`development`, `production`) | `development` |

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
alembic upgrade head
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

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | System health check (database connection, model readiness) |
| `POST` | `/api/students` | Enroll student with portrait image & biometric vector generation |
| `GET` | `/api/students` | List registered students with query filters and pagination |
| `GET` | `/api/students/{id}` | Retrieve student profile details |
| `PUT` | `/api/students/{id}` | Update student information |
| `DELETE`| `/api/students/{id}` | Deactivate or remove student record |
| `POST` | `/api/attendance/mark` | Manually mark attendance |
| `GET` | `/api/attendance` | Query attendance records by date, status, branch, or student |
| `GET` | `/api/attendance/export` | Export filtered attendance records as CSV format |
| `POST` | `/api/recognition/test` | Test face verification on an uploaded image or base64 frame |
| `GET` | `/api/analytics/summary`| Fetch daily/weekly aggregate attendance percentages |
| `GET` | `/api/analytics/trends` | Fetch temporal attendance statistics across semesters |
| `GET` | `/api/analytics/anomalies`| Retrieve flagged anomalies (suspicious liveness, borderline score) |

### WebSocket Endpoint

```text
WS /ws/live-attendance
```

- **Client Payload**: `{"image": "<base64_jpeg_frame>", "auto_mark": true}`
- **Server Response**:

```json
{
  "timestamp": 1727076600.12,
  "faces": [
    {
      "bbox": [140, 85, 210, 260],
      "student_id": 42,
      "student_name": "Alex Mercer",
      "roll_number": "CS-2024-001",
      "confidence": 0.884,
      "liveness_score": 0.941,
      "is_live": true,
      "attendance_marked": true,
      "already_marked": false
    }
  ]
}
```

---

## Automated Testing

Run the test suite covering CV components, biometric normalization, anti-spoofing heuristics, and API routes:

```bash
pytest backend/tests/
```

---

## Security & Biometric Privacy

- **No Face Image Storing**: Raw camera captures and biometric face crops are never permanently written to disk or the relational database.
- **Non-Invertible Embeddings**: Biometric representations are stored solely as 512-dimensional floating-point latent vectors.
- **Client Shielding**: Vector embeddings (`VECTOR(512)`) are explicitly omitted from all public frontend API responses and serialization schemas.
- **SQL Injection Prevention**: All database queries are strictly parameterized via SQLAlchemy ORM and Alembic migrations.

---

## License

This project is licensed under the [MIT License](LICENSE).
