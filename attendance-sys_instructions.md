# Attendance System — Daughter Instructions & Architecture Reference

Project-specific instructions, conventions, and operational context for the `attendance-sys` codebase.

---

## 1. System Overview & Architecture

An enterprise-grade, real-time facial recognition attendance platform leveraging Neon Serverless PostgreSQL with `pgvector`, OpenCV YuNet detection, and ArcFace ResNet-50 embeddings.

### Core Stack
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, OpenCV DNN, ONNX Runtime (`onnxruntime`), pgvector-python.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Axios.
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
│   ├── alembic/              # Database migration scripts
│   ├── app/
│   │   ├── api/              # FastAPI endpoints (health, students, attendance, analytics, recognition)
│   │   ├── cv/               # Computer vision pipeline (detector, embedder, liveness, preprocessing, pipeline)
│   │   ├── db/               # SQLAlchemy engine, base model, session management
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
│   │   ├── api/              # Axios client and typed endpoint methods
│   │   ├── components/       # Reusable UI components (Navbar, Toast, HUD overlays)
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
- **Idempotency**: Attendance per student per calendar date is strictly enforced at the database level (`UNIQUE(student_id, attendance_date)`).
- **Vector Search**: Always use cosine distance `<=>` operator via pgvector for normalized ArcFace embeddings.
- **Model Storage**: Model files (`*.onnx`) are excluded from Git due to file size limits. Always run `python scripts/download_models.py` when configuring a fresh environment.
- **Git Hygiene**: Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`). Never commit `.env` or assistant metadata.
