from datetime import date, time, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    student_name: Optional[str] = None
    roll_number: Optional[str] = None
    branch: Optional[str] = None
    attendance_date: date
    attendance_time: time
    status: str
    confidence: float
    liveness_score: float
    method: str = "face"
    lecture_id: Optional[int] = None
    lecture_subject: Optional[str] = None
    created_at: datetime


class AttendanceListResponse(BaseModel):
    total: int
    items: List[AttendanceRead]


class ManualMarkRequest(BaseModel):
    student_id: int
    lecture_id: Optional[int] = None
