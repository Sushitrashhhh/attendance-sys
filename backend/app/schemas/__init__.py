"""Pydantic schemas for request validation and response serialization."""
from app.schemas.health import HealthResponse
from app.schemas.student import StudentBase, StudentRead, StudentListResponse, StudentUpdate
from app.schemas.attendance import AttendanceRead, AttendanceListResponse

__all__ = [
    "HealthResponse",
    "StudentBase",
    "StudentRead",
    "StudentListResponse",
    "StudentUpdate",
    "AttendanceRead",
    "AttendanceListResponse",
]
