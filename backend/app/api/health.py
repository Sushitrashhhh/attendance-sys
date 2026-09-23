import logging
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.database import get_db, engine
from app.schemas.health import HealthResponse
from app.config import get_settings

logger = logging.getLogger("attendance.health")
router = APIRouter(tags=["Health"])
settings = get_settings()


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Application and Neon Database Health Check",
)
def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    """Checks the health of the FastAPI service and verifies live connectivity to Neon PostgreSQL."""
    db_status = "disconnected"
    diag_details = {}

    try:
        # Execute light diagnostic query to verify database and pgvector extension
        result = db.execute(text("SELECT 1;")).scalar()
        if result == 1:
            db_status = "connected"

        # Check if pgvector extension is available in Postgres
        ext_check = db.execute(
            text("SELECT extname FROM pg_extension WHERE extname = 'vector';")
        ).scalar()
        diag_details["pgvector_installed"] = ext_check == "vector"

    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = "error"
        diag_details["error"] = str(e)

    overall_status = "healthy" if db_status == "connected" else "degraded"

    return HealthResponse(
        status=overall_status,
        database=db_status,
        version="1.0.0",
        environment=settings.app_env,
        details=diag_details,
    )
