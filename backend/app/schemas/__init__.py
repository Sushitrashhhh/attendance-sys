"""Pydantic schemas for request validation and response serialization."""
from app.schemas.health import HealthResponse
from app.schemas.student import StudentBase, StudentCreate, StudentRead, StudentListResponse
from app.schemas.attendance import AttendanceRead, AttendanceResponse

__all__ = [
    "HealthResponse",
    "StudentBase",
    "StudentCreate",
    "StudentRead",
    "StudentListResponse",
    "AttendanceRead",
    "AttendanceResponse",
]
