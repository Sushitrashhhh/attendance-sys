"""Small, pure rules for lecture attendance (kept separate so they're trivially testable)."""
from datetime import datetime, timedelta
from typing import Dict, Optional

from app.db.models import Lecture, Student

MIN_ATTENDANCE_PERCENT = 75  # keep in sync with LOW_ATTENDANCE in frontend/src/lib/constants.ts
FAILED_CHECKS_TO_FLAG = 3  # timed-out head-turn checks in one day that get a student flagged


def attendance_outlook(present: int, total: int, target: int = MIN_ATTENDANCE_PERCENT) -> Optional[Dict[str, int]]:
    """
    How many more classes a student can miss and stay at/above `target`%, or how many
    they must attend in a row to get back to it. Integer maths, so 75% boundaries are exact.
      at/above target: can_miss = largest k with 100*present >= target*(total + k)
      below target:    must_attend = smallest n with 100*(present + n) >= target*(total + n)
    """
    if total <= 0:
        return None
    if 100 * present >= target * total:
        return {"can_miss": (100 * present - target * total) // target}
    return {"must_attend": -(-(target * total - 100 * present) // (100 - target))}


def lecture_status(lecture: Optional[Lecture], now: datetime) -> str:
    """'late' once more than `late_after_minutes` have passed since the lecture started."""
    if lecture is None:
        return "present"
    cutoff = datetime.combine(now.date(), lecture.start_time) + timedelta(minutes=lecture.late_after_minutes)
    return "late" if now > cutoff else "present"


def in_class(student: Student, lecture: Optional[Lecture]) -> bool:
    """Whether a lecture's branch / semester restriction (if any) includes this student."""
    if lecture is None:
        return True
    if lecture.branch and student.branch.strip().lower() != lecture.branch.strip().lower():
        return False
    if lecture.semester and student.semester != lecture.semester:
        return False
    return True
