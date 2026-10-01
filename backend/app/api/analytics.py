from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.attendance import _serialize_attendance
from app.api.lectures import optional_lecture
from app.db.database import get_db
from app.db.models import Lecture, Student
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.lecture_repo import LectureRepository
from app.repositories.student_repo import StudentRepository
from app.services.attendance_rules import MIN_ATTENDANCE_PERCENT, attendance_outlook, in_class

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/overview")
def get_analytics_overview(
    lecture: Optional[Lecture] = Depends(optional_lecture),
    db: Session = Depends(get_db),
):
    """Class size and today's present / late / excused / absent counts, for one lecture or the whole day."""
    return AttendanceRepository(db).get_analytics_overview(lecture)


@router.get("/trends")
def get_attendance_trends(
    days: int = Query(14, ge=3, le=90),
    response: Response = None,
    db: Session = Depends(get_db),
):
    """Fetch attendance trend data for charts over the last N days."""
    if response:
        response.headers["Cache-Control"] = "public, max-age=60"
    repo = AttendanceRepository(db)
    return repo.get_trends(days=days)


@router.get("/distribution")
def get_branch_distribution(response: Response = None, db: Session = Depends(get_db)):
    """Fetch student counts and attendance breakdown grouped by department/branch."""
    if response:
        response.headers["Cache-Control"] = "public, max-age=120"
    stmt = (
        select(
            Student.branch,
            func.count(Student.id).label("total_students"),
        )
        .where(Student.active.is_(True))
        .group_by(Student.branch)
        .order_by(func.count(Student.id).desc())
    )
    rows = db.execute(stmt).all()
    return [{"branch": r[0], "total": r[1]} for r in rows]


@router.get("/students")
def get_student_report(
    lecture: Optional[Lecture] = Depends(optional_lecture),
    db: Session = Depends(get_db),
):
    """Per-student attendance percentage, for one subject (lecture) or across all class days."""
    return AttendanceRepository(db).get_student_report(lecture)


def _summary(row: dict) -> dict:
    keys = ("present_days", "late_days", "excused_days", "total_days", "percentage")
    return {**{k: row[k] for k in keys}, "outlook": attendance_outlook(row["present_days"], row["total_days"])}


@router.get("/self-check/{roll_number}")
def student_self_check(roll_number: str, db: Session = Depends(get_db)):
    """
    A student's own attendance: overall, per subject (all timetable slots of a subject combined),
    how many classes they can still miss or must attend to stay at the minimum, and recent check-ins.
    """
    # ponytail: anyone who knows a roll number can see that student's attendance; add a PIN/login if that matters
    student = StudentRepository(db).get_by_roll_number(roll_number)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No student with roll number '{roll_number}'.")
    repo = AttendanceRepository(db)

    by_subject: dict = {}
    for lec in LectureRepository(db).list_active():
        if in_class(student, lec):
            by_subject.setdefault(lec.subject.strip().lower(), []).append(lec)
    subjects = []
    for lectures in by_subject.values():
        [row] = repo.get_student_report(student_id=student.id, lecture_ids=[l.id for l in lectures])
        subjects.append({"subject": lectures[0].subject, **_summary(row)})
    subjects.sort(key=lambda s: (s["percentage"] is None, s["percentage"] or 0, s["subject"].lower()))

    [overall] = repo.get_student_report(student_id=student.id)
    return {
        "student": {
            "name": student.name,
            "roll_number": student.roll_number,
            "branch": student.branch,
            "semester": student.semester,
        },
        "target": MIN_ATTENDANCE_PERCENT,
        "overall": _summary(overall),
        "subjects": subjects,
        "recent": [_serialize_attendance(r) for r in repo.get_student_records(student.id)[:10]],
    }


@router.get("/anomalies")
def get_anomalies(db: Session = Depends(get_db)):
    """Fetch explainable anomalies: borderline confidence, suspicious liveness, off-hour scans, repeated failed head-turns."""
    repo = AttendanceRepository(db)
    return repo.get_anomalies()


@router.delete("/failed-checks")
def dismiss_failed_checks(
    student_id: int = Query(...),
    day: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    """Dismiss a "repeated failed head-turn" flag after the teacher has looked into it."""
    return {"removed": AttendanceRepository(db).dismiss_failed_checks(student_id, day)}
