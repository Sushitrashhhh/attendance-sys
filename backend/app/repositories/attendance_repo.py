from datetime import date, datetime, timedelta, time
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func, desc, and_, or_
from sqlalchemy.exc import IntegrityError

from app.db.models import Attendance, Student


class AttendanceRepository:
    """Repository handling Attendance database queries, idempotent marking, and analytics."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_student_and_date(
        self, student_id: int, target_date: date
    ) -> Optional[Attendance]:
        stmt = select(Attendance).where(
            Attendance.student_id == student_id,
            Attendance.attendance_date == target_date,
        )
        return self.db.execute(stmt).scalars().first()

    def mark_attendance(
        self,
        student_id: int,
        confidence: float,
        liveness_score: float,
        status: str = "present",
    ) -> Tuple[Attendance, str]:
        """
        Idempotent attendance marking:
        1. Checks if record exists for today.
        2. If not, inserts record.
        3. Catches IntegrityError (UNIQUE constraint race condition) and returns existing record.
        Returns: (Attendance, 'marked' | 'already_marked')
        """
        today = date.today()
        existing = self.get_by_student_and_date(student_id, today)
        if existing:
            return existing, "already_marked"

        record = Attendance(
            student_id=student_id,
            attendance_date=today,
            attendance_time=datetime.now().time(),
            status=status,
            confidence=round(confidence, 4),
            liveness_score=round(liveness_score, 4),
        )

        try:
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
            return record, "marked"
        except IntegrityError:
            self.db.rollback()
            existing = self.get_by_student_and_date(student_id, today)
            if existing:
                return existing, "already_marked"
            raise

    def get_today_records(self) -> List[Attendance]:
        today = date.today()
        stmt = (
            select(Attendance)
            .options(joinedload(Attendance.student))
            .where(Attendance.attendance_date == today)
            .order_by(Attendance.attendance_time.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def list_records(
        self,
        skip: int = 0,
        limit: int = 100,
        date_filter: Optional[date] = None,
        student_id: Optional[int] = None,
    ) -> Tuple[List[Attendance], int]:
        query = select(Attendance).options(joinedload(Attendance.student))

        conditions = []
        if date_filter:
            conditions.append(Attendance.attendance_date == date_filter)
        if student_id:
            conditions.append(Attendance.student_id == student_id)

        if conditions:
            query = query.where(and_(*conditions))

        # Count total
        count_stmt = select(func.count()).select_from(query.subquery())
        total = self.db.execute(count_stmt).scalar() or 0

        # Fetch records
        fetch_stmt = (
            query.order_by(
                Attendance.attendance_date.desc(),
                Attendance.attendance_time.desc(),
            )
            .offset(skip)
            .limit(limit)
        )
        items = list(self.db.execute(fetch_stmt).scalars().all())
        return items, total

    def get_student_records(self, student_id: int) -> List[Attendance]:
        stmt = (
            select(Attendance)
            .options(joinedload(Attendance.student))
            .where(Attendance.student_id == student_id)
            .order_by(Attendance.attendance_date.desc(), Attendance.attendance_time.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_analytics_overview(self) -> Dict[str, Any]:
        """Calculates real total students, present today, absent today, attendance rate."""
        today = date.today()

        # Total active students
        total_students_stmt = select(func.count(Student.id)).where(Student.active.is_(True))
        total_students = self.db.execute(total_students_stmt).scalar() or 0

        # Present today (distinct students marked present today)
        present_today_stmt = (
            select(func.count(Attendance.id))
            .join(Student, Student.id == Attendance.student_id)
            .where(
                Attendance.attendance_date == today,
                Attendance.status == "present",
                Student.active.is_(True),
            )
        )
        present_today = self.db.execute(present_today_stmt).scalar() or 0

        absent_today = max(0, total_students - present_today)
        attendance_rate = (
            round((present_today / total_students) * 100.0, 1) if total_students > 0 else 0.0
        )

        return {
            "total_students": total_students,
            "present_today": present_today,
            "absent_today": absent_today,
            "attendance_rate": attendance_rate,
            "date": today.isoformat(),
        }

    def get_trends(self, days: int = 14) -> List[Dict[str, Any]]:
        """Attendance trends for the past N calendar days."""
        today = date.today()
        start_date = today - timedelta(days=days - 1)

        stmt = (
            select(
                Attendance.attendance_date,
                func.count(Attendance.id).label("count"),
            )
            .join(Student, Student.id == Attendance.student_id)
            .where(
                Attendance.attendance_date >= start_date,
                Attendance.attendance_date <= today,
                Attendance.status == "present",
                Student.active.is_(True),
            )
            .group_by(Attendance.attendance_date)
            .order_by(Attendance.attendance_date.asc())
        )
        results = self.db.execute(stmt).all()
        counts_by_date = {row[0]: row[1] for row in results}

        # Format full sequence of days including zero-attendance days
        trends = []
        for i in range(days):
            d = start_date + timedelta(days=i)
            trends.append({
                "date": d.isoformat(),
                "day": d.strftime("%a"),
                "present": counts_by_date.get(d, 0),
            })

        return trends

    def get_anomalies(self) -> List[Dict[str, Any]]:
        """
        Explainable anomaly detection queries:
        1. Low confidence matches (< 0.70)
        2. Marginal liveness scores (< 0.75)
        3. Unusual attendance hours (outside 07:00 - 18:00)
        """
        anomalies = []

        # 1. Borderline recognition confidence
        stmt_conf = (
            select(Attendance)
            .options(joinedload(Attendance.student))
            .where(Attendance.confidence < 0.70)
            .order_by(Attendance.created_at.desc())
            .limit(10)
        )
        for att in self.db.execute(stmt_conf).scalars().all():
            if att.student:
                anomalies.append({
                    "type": "BORDERLINE_CONFIDENCE",
                    "severity": "medium",
                    "student_id": att.student_id,
                    "student_name": att.student.name,
                    "roll_number": att.student.roll_number,
                    "date": att.attendance_date.isoformat(),
                    "time": att.attendance_time.strftime("%H:%M:%S"),
                    "value": att.confidence,
                    "reason": f"Recognition confidence was {round(att.confidence * 100, 1)}%, near acceptance threshold.",
                })

        # 2. Borderline liveness score
        stmt_live = (
            select(Attendance)
            .options(joinedload(Attendance.student))
            .where(Attendance.liveness_score < 0.75)
            .order_by(Attendance.created_at.desc())
            .limit(10)
        )
        for att in self.db.execute(stmt_live).scalars().all():
            if att.student:
                anomalies.append({
                    "type": "BORDERLINE_LIVENESS",
                    "severity": "high",
                    "student_id": att.student_id,
                    "student_name": att.student.name,
                    "roll_number": att.student.roll_number,
                    "date": att.attendance_date.isoformat(),
                    "time": att.attendance_time.strftime("%H:%M:%S"),
                    "value": att.liveness_score,
                    "reason": f"Liveness score was {round(att.liveness_score * 100, 1)}%, indicating possible reflection/print artifact.",
                })

        # 3. Off-hours attendance (before 7 AM or after 6 PM)
        stmt_time = (
            select(Attendance)
            .options(joinedload(Attendance.student))
            .where(
                or_(
                    Attendance.attendance_time < time(7, 0, 0),
                    Attendance.attendance_time > time(18, 0, 0),
                )
            )
            .order_by(Attendance.created_at.desc())
            .limit(10)
        )
        for att in self.db.execute(stmt_time).scalars().all():
            if att.student:
                anomalies.append({
                    "type": "UNUSUAL_TIME",
                    "severity": "low",
                    "student_id": att.student_id,
                    "student_name": att.student.name,
                    "roll_number": att.student.roll_number,
                    "date": att.attendance_date.isoformat(),
                    "time": att.attendance_time.strftime("%H:%M:%S"),
                    "value": att.attendance_time.strftime("%H:%M"),
                    "reason": f"Attendance registered at unusual off-hours ({att.attendance_time.strftime('%H:%M')}).",
                })

        # Sort anomalies by recency
        anomalies.sort(key=lambda x: f"{x['date']} {x['time']}", reverse=True)
        return anomalies
