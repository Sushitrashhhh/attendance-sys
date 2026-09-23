from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.db.database import get_db
from app.db.models import Student, Attendance
from app.repositories.attendance_repo import AttendanceRepository

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/overview")
def get_analytics_overview(db: Session = Depends(get_db)):
    """Fetch live system overview metrics: total students, present today, absent today, attendance rate."""
    repo = AttendanceRepository(db)
    return repo.get_analytics_overview()


@router.get("/trends")
def get_attendance_trends(
    days: int = Query(14, ge=3, le=90),
    db: Session = Depends(get_db),
):
    """Fetch attendance trend data for charts over the last N days."""
    repo = AttendanceRepository(db)
    return repo.get_trends(days=days)


@router.get("/distribution")
def get_branch_distribution(db: Session = Depends(get_db)):
    """Fetch student counts and attendance breakdown grouped by department/branch."""
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


@router.get("/anomalies")
def get_anomalies(db: Session = Depends(get_db)):
    """Fetch explainable anomalies: borderline confidence, suspicious liveness, off-hour scans."""
    repo = AttendanceRepository(db)
    return repo.get_anomalies()
