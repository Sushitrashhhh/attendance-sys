from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.repositories.attendance_repo import AttendanceRepository
from app.schemas.attendance import AttendanceRead, AttendanceListResponse

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


def _serialize_attendance(att) -> AttendanceRead:
    return AttendanceRead(
        id=att.id,
        student_id=att.student_id,
        student_name=att.student.name if att.student else None,
        roll_number=att.student.roll_number if att.student else None,
        branch=att.student.branch if att.student else None,
        attendance_date=att.attendance_date,
        attendance_time=att.attendance_time,
        status=att.status,
        confidence=att.confidence,
        liveness_score=att.liveness_score,
        created_at=att.created_at,
    )


@router.get("", response_model=AttendanceListResponse)
def get_attendance(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    attendance_date: Optional[date] = Query(None, alias="date"),
    student_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """List attendance records with date and student filtering."""
    repo = AttendanceRepository(db)
    records, total = repo.list_records(
        skip=skip,
        limit=limit,
        date_filter=attendance_date,
        student_id=student_id,
    )
    items = [_serialize_attendance(r) for r in records]
    return AttendanceListResponse(total=total, items=items)


@router.get("/today", response_model=List[AttendanceRead])
def get_today_attendance(db: Session = Depends(get_db)):
    """Fetch all attendance records marked for the current calendar date."""
    repo = AttendanceRepository(db)
    records = repo.get_today_records()
    return [_serialize_attendance(r) for r in records]


@router.get("/student/{student_id}", response_model=List[AttendanceRead])
def get_student_attendance(student_id: int, db: Session = Depends(get_db)):
    """Fetch all historical attendance records for a specific student."""
    repo = AttendanceRepository(db)
    records = repo.get_student_records(student_id)
    return [_serialize_attendance(r) for r in records]
