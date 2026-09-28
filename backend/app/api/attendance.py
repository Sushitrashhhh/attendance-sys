import csv
import io
from datetime import date, datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.lectures import optional_lecture
from app.db.database import get_db
from app.db.models import Lecture
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.lecture_repo import LectureRepository
from app.repositories.student_repo import StudentRepository
from app.schemas.attendance import AttendanceRead, AttendanceListResponse, ManualMarkRequest
from app.schemas.student import StudentRead
from app.services.attendance_rules import in_class, lecture_status

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
        method=att.method,
        lecture_id=att.lecture_id,
        lecture_subject=att.lecture.subject if att.lecture else None,
        created_at=att.created_at,
    )


@router.get("", response_model=AttendanceListResponse)
def get_attendance(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, description="Name, roll number or branch"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    student_id: Optional[int] = Query(None),
    lecture_id: Optional[int] = Query(None, description="Only this lecture's records (includes removed lectures)"),
    db: Session = Depends(get_db),
):
    """List attendance records, newest first, with search, date-range and lecture filtering."""
    records, total = AttendanceRepository(db).list_records(
        skip=skip,
        limit=limit,
        search=search,
        date_from=date_from,
        date_to=date_to,
        student_id=student_id,
        lecture_id=lecture_id,
    )
    return AttendanceListResponse(total=total, items=[_serialize_attendance(r) for r in records])


@router.get("/export")
def export_attendance(
    search: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    lecture_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Download every record matching the filters as CSV (not just the visible page)."""
    records = AttendanceRepository(db).export_records(search, date_from, date_to, lecture_id)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Date", "Time", "Lecture", "Roll Number", "Name", "Branch", "Status", "Method", "Confidence", "Liveness",
    ])
    for r in records:
        is_face = r.method == "face"
        writer.writerow([
            r.attendance_date.isoformat(),
            r.attendance_time.strftime("%H:%M:%S"),
            r.lecture.subject if r.lecture else "Whole day",
            r.student.roll_number,
            r.student.name,
            r.student.branch,
            r.status,
            r.method,
            f"{r.confidence:.4f}" if is_face else "",
            f"{r.liveness_score:.4f}" if is_face else "",
        ])

    name = "attendance"
    if date_from or date_to:
        name += f"_{date_from or 'start'}_to_{date_to or 'today'}"
    # utf-8-sig so Excel opens names with non-ASCII characters correctly
    return Response(
        content=buf.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{name}.csv"'},
    )


@router.get("/today", response_model=List[AttendanceRead])
def get_today_attendance(
    lecture: Optional[Lecture] = Depends(optional_lecture),
    db: Session = Depends(get_db),
):
    """Today's records: for one lecture, or every record of the day."""
    return [_serialize_attendance(r) for r in AttendanceRepository(db).get_today_records(lecture)]


@router.get("/absent-today", response_model=List[StudentRead])
def get_absent_today(
    lecture: Optional[Lecture] = Depends(optional_lecture),
    db: Session = Depends(get_db),
):
    """Students of the class not yet marked today (for this lecture, or at all)."""
    return AttendanceRepository(db).get_absent_today(lecture)


@router.post("/mark", response_model=AttendanceRead)
def mark_manually(payload: ManualMarkRequest, db: Session = Depends(get_db)):
    """Mark a student present (or late, per the lecture's cutoff) by hand."""
    student = StudentRepository(db).get_by_id(payload.student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with ID {payload.student_id} not found.",
        )
    lecture = None
    if payload.lecture_id is not None:
        lecture = LectureRepository(db).get_active(payload.lecture_id)
        if lecture is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture {payload.lecture_id} not found.")
        if not in_class(student, lecture):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{student.name} is not in the class for {lecture.subject}.",
            )

    record, result = AttendanceRepository(db).mark_attendance(
        student_id=student.id,
        confidence=0.0,
        liveness_score=0.0,
        status=lecture_status(lecture, datetime.now()),
        method="manual",
        lecture_id=lecture.id if lecture else None,
    )
    if result == "already_marked":
        where = f" for {lecture.subject}" if lecture else ""
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{student.name} is already marked{where} today.",
        )
    return _serialize_attendance(record)


@router.delete("/{record_id}")
def delete_attendance(record_id: int, db: Session = Depends(get_db)):
    """Remove a wrongly-marked attendance record."""
    if not AttendanceRepository(db).delete(record_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record {record_id} not found.",
        )
    return {"success": True}


@router.get("/student/{student_id}", response_model=List[AttendanceRead])
def get_student_attendance(student_id: int, db: Session = Depends(get_db)):
    """Fetch all historical attendance records for a specific student."""
    return [_serialize_attendance(r) for r in AttendanceRepository(db).get_student_records(student_id)]
