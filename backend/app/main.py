import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.api.health import router as health_router
from app.api.students import router as students_router
from app.api.attendance import router as attendance_router
from app.api.analytics import router as analytics_router
from app.api.recognition import router as recognition_router

# Configure clean, structured logging (secrets & raw biometrics are strictly excluded)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("attendance.main")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown hooks."""
    logger.info("Initializing AI-Powered Face Recognition Attendance System...")
    logger.info(f"Environment: {settings.app_env}")
    logger.info(f"Recognition Threshold: {settings.recognition_threshold}")
    logger.info(f"Liveness Threshold: {settings.liveness_threshold}")
    yield
    logger.info("Application shutdown complete.")


app = FastAPI(
    title="AI-Powered Face Recognition Attendance System API",
    description="Enterprise-grade face recognition attendance backend with Neon PostgreSQL, pgvector, and real-time vision pipeline.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Configuration
origins = settings.cors_origins
logger.info(f"Configuring CORS for allowed origins: {origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.recognition import websocket_recognition

# Register API Routers
app.include_router(health_router)
app.include_router(students_router)
app.include_router(attendance_router)
app.include_router(analytics_router)
app.include_router(recognition_router)

# Mount direct WebSocket endpoint for live camera feed
app.add_api_websocket_route("/ws/live-attendance", websocket_recognition)



@app.get("/", tags=["Root"])
def read_root():
    return {
        "service": "AI-Powered Face Recognition Attendance System",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
    }
