from bisect import bisect_left
from collections import defaultdict
from datetime import date, datetime, timedelta, time
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import delete, select, func, or_, distinct
from sqlalchemy.exc import IntegrityError

from app.db.models import Attendance, Excusal, FailedCheck, Lecture, Student
from app.services.attendance_rules import FAILED_CHECKS_TO_FLAG

ATTENDED = ("present", "late")


def class_conditions(lecture: Optional[Lecture]) -> list:
    """SQL conditions selecting the students who belong to a lecture's class (all active students if none)."""
    conds = [Student.active.is_(True)]
    if lecture is not None and lecture.branch:
        conds.append(func.lower(Student.branch) == lecture.branch.strip().lower())
    if lecture is not None and lecture.semester:
        conds.append(Student.semester == lecture.semester)
    return conds


def _lecture_is(lecture_id: Optional[int]):
    return Attendance.lecture_id.is_(None) if lecture_id is None else Attendance.lecture_id == lecture_id


class AttendanceRepository:
    """Repository handling Attendance database queries, idempotent marking, and analytics.

    Attendance is either whole-day (lecture_id NULL) or tied to one timetable lecture.
    Where a query takes an optional lecture, None means "the whole day, any lecture".
    """

    def __init__(self, db: Session):
        self.db = db

    def get_by_student_and_date(
        self, student_id: int, target_date: date, lecture_id: Optional[int] = None
    ) -> Optional[Attendance]:
        stmt = select(Attendance).where(
            Attendance.student_id == student_id,
            Attendance.attendance_date == target_date,
            _lecture_is(lecture_id),
        )
        return self.db.execute(stmt).scalars().first()

    def mark_attendance(
        self,
        student_id: int,
        confidence: float,
        liveness_score: float,
        status: str = "present",
        method: str = "face",
        lecture_id: Optional[int] = None,
    ) -> Tuple[Attendance, str]:
        """
        Idempotent attendance marking (one record per student, date and lecture):
        1. Checks if a record exists for today (and this lecture).
        2. If not, inserts record.
        3. Catches IntegrityError (unique index race condition) and returns existing record.
        Returns: (Attendance, 'marked' | 'already_marked')
        """
        today = date.today()
        existing = self.get_by_student_and_date(student_id, today, lecture_id)
        if existing:
            return existing, "already_marked"

        record = Attendance(
            student_id=student_id,
            attendance_date=today,
            attendance_time=datetime.now().time(),
            status=status,
            confidence=round(confidence, 4),
            liveness_score=round(liveness_score, 4),
            method=method,
            lecture_id=lecture_id,
        )

        try:
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
            return record, "marked"
        except IntegrityError:
            self.db.rollback()
            existing = self.get_by_student_and_date(student_id, today, lecture_id)
            if existing:
                return existing, "already_marked"
            raise

    def get_today_records(self, lecture: Optional[Lecture] = None) -> List[Attendance]:
        stmt = (
            select(Attendance)
            .options(joinedload(Attendance.student), joinedload(Attendance.lecture))
            .where(Attendance.attendance_date == date.today())
            .order_by(Attendance.attendance_time.desc())
        )
        if lecture is not None:
            stmt = stmt.where(Attendance.lecture_id == lecture.id)
        return list(self.db.execute(stmt).scalars().all())

    def _filtered(
        self,
        search: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        student_id: Optional[int] = None,
        lecture_id: Optional[int] = None,
    ):
        query = select(Attendance).join(Student, Student.id == Attendance.student_id)
        if date_from:
            query = query.where(Attendance.attendance_date >= date_from)
        if date_to:
            query = query.where(Attendance.attendance_date <= date_to)
        if student_id:
            query = query.where(Attendance.student_id == student_id)
        if lecture_id:
            query = query.where(Attendance.lecture_id == lecture_id)
        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            query = query.where(
                or_(
                    func.lower(Student.name).like(term),
                    func.lower(Student.roll_number).like(term),
                    func.lower(Student.branch).like(term),
                )
            )
        return query

    def list_records(
        self,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        student_id: Optional[int] = None,
        lecture_id: Optional[int] = None,
    ) -> Tuple[List[Attendance], int]:
        query = self._filtered(search, date_from, date_to, student_id, lecture_id)
        total = self.db.execute(select(func.count()).select_from(query.subquery())).scalar() or 0
        items = self.db.execute(
            query.options(joinedload(Attendance.student), joinedload(Attendance.lecture))
            .order_by(Attendance.attendance_date.desc(), Attendance.attendance_time.desc())
            .offset(skip)
            .limit(limit)
        ).scalars().all()
        return list(items), total

    def export_records(
        self,
        search: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        lecture_id: Optional[int] = None,
    ) -> List[Attendance]:
        query = self._filtered(search, date_from, date_to, lecture_id=lecture_id)
        return list(
            self.db.execute(
                query.options(joinedload(Attendance.student), joinedload(Attendance.lecture)).order_by(
                    Attendance.attendance_date.asc(), Attendance.attendance_time.asc(), Student.roll_number.asc()
                )
            ).scalars().all()
        )

    def delete(self, record_id: int) -> bool:
        record = self.db.get(Attendance, record_id)
        if not record:
            return False
        self.db.delete(record)
        self.db.commit()
        return True

    def _marked_today(self, lecture: Optional[Lecture]):
        marked = select(Attendance.student_id).where(Attendance.attendance_date == date.today())
        if lecture is not None:
            marked = marked.where(Attendance.lecture_id == lecture.id)
        return marked

    @staticmethod
    def _excused_on(day: date):
        return select(Excusal.student_id).where(Excusal.date_from <= day, Excusal.date_to >= day)

    def get_absent_today(self, lecture: Optional[Lecture] = None) -> List[Student]:
        """Students of the class with no record today and no excused absence covering today."""
        stmt = (
            select(Student)
            .where(
                *class_conditions(lecture),
                Student.id.not_in(self._marked_today(lecture)),
                Student.id.not_in(self._excused_on(date.today())),
            )
            .order_by(Student.roll_number.asc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_student_report(
        self,
        lecture: Optional[Lecture] = None,
        student_id: Optional[int] = None,
        lecture_ids: Optional[List[int]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Per-student attendance percentage.
        Whole day: a "class day" is any date on which any attendance was recorded.
        Per lecture: a class day is a date on which that lecture's attendance was taken.
        `lecture_ids` combines several timetable slots of one subject (no class filter applied).
        Each student only counts class days on or after their enrollment date. Late counts as
        attended. Class days covered by an excused absence (and not attended) are left out.
        """
        # ponytail: class days are inferred from recorded attendance, and every attended date is loaded
        # into memory; add a sessions table / SQL aggregation if lectures with zero attendees must count or data grows large
        days_q = select(Attendance.attendance_date).distinct()
        attended_q = select(Attendance.student_id, Attendance.attendance_date, Attendance.status).where(
            Attendance.status.in_(ATTENDED)
        )
        excusals_q = select(Excusal.student_id, Excusal.date_from, Excusal.date_to)
        students_q = (
            select(
                Student.id, Student.name, Student.roll_number, Student.branch,
                Student.semester, Student.created_at,
            )
            .where(*class_conditions(lecture))
            .order_by(Student.roll_number.asc())
        )
        if lecture is not None:
            lecture_ids = [lecture.id]
        if lecture_ids is not None:
            days_q = days_q.where(Attendance.lecture_id.in_(lecture_ids))
            attended_q = attended_q.where(Attendance.lecture_id.in_(lecture_ids))
        if student_id is not None:
            attended_q = attended_q.where(Attendance.student_id == student_id)
            excusals_q = excusals_q.where(Excusal.student_id == student_id)
            students_q = students_q.where(Student.id == student_id)

        class_days = sorted(self.db.execute(days_q).scalars().all())
        attended: Dict[int, set] = defaultdict(set)
        late: Dict[int, set] = defaultdict(set)
        for sid, day, status in self.db.execute(attended_q).all():
            attended[sid].add(day)
            if status == "late":
                late[sid].add(day)
        excused_ranges: Dict[int, list] = defaultdict(list)
        for sid, d_from, d_to in self.db.execute(excusals_q).all():
            excused_ranges[sid].append((d_from, d_to))

        report = []
        for s in self.db.execute(students_q).all():
            days = class_days[bisect_left(class_days, s.created_at.date()):]
            went = attended[s.id]
            excused = sum(
                1 for d in days
                if d not in went and any(f <= d <= t for f, t in excused_ranges[s.id])
            )
            present = len(went)
            total_days = max(len(days) - excused, present)
            report.append({
                "student_id": s.id,
                "name": s.name,
                "roll_number": s.roll_number,
                "branch": s.branch,
                "semester": s.semester,
                "present_days": present,
                "late_days": len(late[s.id]),
                "excused_days": excused,
                "total_days": total_days,
                "percentage": round(present / total_days * 100, 1) if total_days else None,
            })
        return report

    def get_student_records(self, student_id: int) -> List[Attendance]:
        stmt = (
            select(Attendance)
            .options(joinedload(Attendance.student), joinedload(Attendance.lecture))
            .where(Attendance.student_id == student_id)
            .order_by(Attendance.attendance_date.desc(), Attendance.attendance_time.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_analytics_overview(self, lecture: Optional[Lecture] = None) -> Dict[str, Any]:
        """Class size, distinct students attended today (for a lecture or the whole day), late count, rate."""
        today = date.today()
        total_students = self.db.execute(
            select(func.count(Student.id)).where(*class_conditions(lecture))
        ).scalar() or 0

        def distinct_students(*extra):
            stmt = (
                select(func.count(distinct(Attendance.student_id)))
                .join(Student, Student.id == Attendance.student_id)
                .where(Attendance.attendance_date == today, *class_conditions(lecture), *extra)
            )
            if lecture is not None:
                stmt = stmt.where(Attendance.lecture_id == lecture.id)
            return self.db.execute(stmt).scalar() or 0

        present_today = distinct_students(Attendance.status.in_(ATTENDED))
        late_today = distinct_students(Attendance.status == "late")
        excused_today = self.db.execute(
            select(func.count(Student.id)).where(
                *class_conditions(lecture),
                Student.id.in_(self._excused_on(today)),
                Student.id.not_in(self._marked_today(lecture)),
            )
        ).scalar() or 0
        absent_today = max(0, total_students - present_today - excused_today)
        expected = total_students - excused_today
        attendance_rate = round(present_today / expected * 100.0, 1) if expected > 0 else 0.0

        return {
            "total_students": total_students,
            "present_today": present_today,
            "late_today": late_today,
            "excused_today": excused_today,
            "absent_today": absent_today,
            "attendance_rate": attendance_rate,
            "date": today.isoformat(),
        }

    def get_trends(self, days: int = 14) -> List[Dict[str, Any]]:
        """Distinct students who attended (any lecture) on each of the past N calendar days."""
        today = date.today()
        start_date = today - timedelta(days=days - 1)

        stmt = (
            select(
                Attendance.attendance_date,
                func.count(distinct(Attendance.student_id)).label("count"),
            )
            .join(Student, Student.id == Attendance.student_id)
            .where(
                Attendance.attendance_date >= start_date,
                Attendance.attendance_date <= today,
                Attendance.status.in_(ATTENDED),
                Student.active.is_(True),
            )
            .group_by(Attendance.attendance_date)
        )
        counts_by_date = {row[0]: row[1] for row in self.db.execute(stmt).all()}

        # Full sequence of days including zero-attendance days
        return [
            {
                "date": (d := start_date + timedelta(days=i)).isoformat(),
                "day": d.strftime("%a"),
                "present": counts_by_date.get(d, 0),
            }
            for i in range(days)
        ]

    def record_failed_check(self, student_id: int, lecture_id: Optional[int]) -> None:
        now = datetime.now()
        self.db.add(FailedCheck(student_id=student_id, lecture_id=lecture_id, check_date=now.date(), check_time=now.time()))
        self.db.commit()

    def dismiss_failed_checks(self, student_id: int, day: date) -> int:
        removed = self.db.execute(
            delete(FailedCheck).where(FailedCheck.student_id == student_id, FailedCheck.check_date == day)
        ).rowcount
        self.db.commit()
        return removed or 0

    def get_anomalies(self) -> List[Dict[str, Any]]:
        """
        Explainable anomaly detection queries (camera check-ins only):
        1. Low confidence matches (< 0.70)
        2. Marginal liveness scores (< 0.75)
        3. Unusual attendance hours (outside 07:00 - 18:00)
        """
        checks = [
            (
                "BORDERLINE_CONFIDENCE", "medium", Attendance.confidence < 0.70,
                lambda a: a.confidence,
                lambda a: f"Recognition confidence was {round(a.confidence * 100, 1)}%, near acceptance threshold.",
            ),
            (
                "BORDERLINE_LIVENESS", "high", Attendance.liveness_score < 0.75,
                lambda a: a.liveness_score,
                lambda a: f"Liveness score was {round(a.liveness_score * 100, 1)}%, indicating possible reflection/print artifact.",
            ),
            (
                "UNUSUAL_TIME", "low",
                or_(Attendance.attendance_time < time(7, 0, 0), Attendance.attendance_time > time(18, 0, 0)),
                lambda a: a.attendance_time.strftime("%H:%M"),
                lambda a: f"Attendance registered at unusual off-hours ({a.attendance_time.strftime('%H:%M')}).",
            ),
        ]

        anomalies = []
        for kind, severity, condition, value, reason in checks:
            stmt = (
                select(Attendance)
                .options(joinedload(Attendance.student))
                .where(Attendance.method == "face", condition)
                .order_by(Attendance.created_at.desc())
                .limit(10)
            )
            for att in self.db.execute(stmt).scalars().all():
                if att.student:
                    anomalies.append({
                        "type": kind,
                        "record_id": att.id,
                        "severity": severity,
                        "student_id": att.student_id,
                        "student_name": att.student.name,
                        "roll_number": att.student.roll_number,
                        "date": att.attendance_date.isoformat(),
                        "time": att.attendance_time.strftime("%H:%M:%S"),
                        "value": value(att),
                        "reason": reason(att),
                    })

        # 4. Repeated failed head-turn checks on one day: possible photo / video proxy
        repeated = self.db.execute(
            select(
                FailedCheck.student_id, FailedCheck.check_date,
                func.count(FailedCheck.id), func.max(FailedCheck.check_time),
                Student.name, Student.roll_number,
            )
            .join(Student, Student.id == FailedCheck.student_id)
            .group_by(FailedCheck.student_id, FailedCheck.check_date, Student.name, Student.roll_number)
            .having(func.count(FailedCheck.id) >= FAILED_CHECKS_TO_FLAG)
            .order_by(FailedCheck.check_date.desc())
            .limit(10)
        ).all()
        for sid, day, count, last_time, name, roll in repeated:
            # Context for the teacher: a real student who fumbled the instruction usually passes soon after
            first_checkin = self.db.execute(
                select(func.min(Attendance.attendance_time)).where(
                    Attendance.student_id == sid, Attendance.attendance_date == day, Attendance.method == "face"
                )
            ).scalar()
            outcome = (
                f" They did check in on camera at {first_checkin.strftime('%H:%M')}, so it may just have been a fumbled head turn."
                if first_checkin
                else " They never checked in on camera that day."
            )
            anomalies.append({
                "type": "REPEATED_FAILED_CHECKS",
                "record_id": None,
                "severity": "high",
                "student_id": sid,
                "student_name": name,
                "roll_number": roll,
                "date": day.isoformat(),
                "time": last_time.strftime("%H:%M:%S"),
                "value": count,
                "reason": f"Failed the head-turn check {count} times that day. Someone may have tried to check in with a photo or video.{outcome}",
            })

        # Sort anomalies by recency
        anomalies.sort(key=lambda x: f"{x['date']} {x['time']}", reverse=True)
        return anomalies
