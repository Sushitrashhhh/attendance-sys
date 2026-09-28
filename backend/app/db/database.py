import logging
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.config import get_settings

logger = logging.getLogger("attendance.db")

settings = get_settings()

def get_engine_url() -> str:
    """Validate and format the DATABASE_URL for SQLAlchemy."""
    raw_url = settings.database_url
    if not raw_url or not raw_url.strip():
        raise ValueError(
            "DATABASE_URL is missing or empty! Please configure DATABASE_URL in your .env file."
        )
    # Ensure standard postgresql driver format with psycopg2
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+"):
        raw_url = raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return raw_url


# Create engine with resilient connection pool settings for Neon serverless Postgres
try:
    _url = get_engine_url()
    engine = create_engine(
        _url,
        pool_pre_ping=True,       # Recovers safely from serverless suspend/disconnects
        pool_size=10,             # Keep connection pool moderate
        max_overflow=15,          # Burst capacity
        pool_recycle=300,         # Recycle connections every 5 mins
        echo=False,               # Never log SQL with sensitive parameters
    )
except ValueError as e:
    # When initializing without DATABASE_URL during schema inspection or initial load,
    # create a dummy or uninitialized state that raises a clear runtime error on connection attempt.
    logger.warning("DATABASE_URL is not configured yet. Database operations will require DATABASE_URL.")
    engine = None

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None
Base = declarative_base()


from contextlib import contextmanager


def get_db() -> Generator[Session, None, None]:
    """FastAPI database session dependency."""
    if SessionLocal is None:
        raise RuntimeError(
            "Database engine is not initialized. Please verify that DATABASE_URL is set in your .env file."
        )
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """Context manager for non-HTTP workflows (tests, background tasks, scripts)."""
    if SessionLocal is None:
        raise RuntimeError("Database engine is not initialized.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

