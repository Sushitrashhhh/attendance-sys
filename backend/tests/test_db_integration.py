import numpy as np
from datetime import date, time
from sqlalchemy import select
from app.db.database import SessionLocal
from app.db.models import Student, Attendance


def test_neon_student_and_attendance_lifecycle():
    """Verify complete CRUD, pgvector storage, and duplicate prevention in Neon."""
    db = SessionLocal()
    test_roll = "TEST_ROLL_9999"

    try:
        # Cleanup if leftover from previous run
        existing = db.execute(select(Student).where(Student.roll_number == test_roll)).scalar_one_or_none()
        if existing:
            db.delete(existing)
            db.commit()

        # 1. Create a student with a normalized 512-dim embedding
        dummy_vec = np.random.randn(512).astype(np.float32)
        dummy_vec /= np.linalg.norm(dummy_vec)  # L2-normalize
        student = Student(
            name="Test Verification Student",
            roll_number=test_roll,
            branch="CSE",
            semester=6,
            embedding=dummy_vec.tolist(),
            active=True,
        )
        db.add(student)
        db.commit()
        db.refresh(student)

        assert student.id is not None
        assert len(student.embedding) == 512

        # 2. Add attendance record for today
        today = date.today()
        att = Attendance(
            student_id=student.id,
            attendance_date=today,
            attendance_time=time(9, 30, 0),
            status="present",
            confidence=0.94,
            liveness_score=0.88,
        )
        db.add(att)
        db.commit()
        db.refresh(att)

        assert att.id is not None
        assert att.student_id == student.id

        # 3. Test UNIQUE(student_id, attendance_date) constraint
        duplicate_att = Attendance(
            student_id=student.id,
            attendance_date=today,
            attendance_time=time(10, 0, 0),
            status="present",
            confidence=0.91,
            liveness_score=0.85,
        )
        db.add(duplicate_att)
        duplicate_failed = False
        try:
            db.commit()
        except Exception:
            db.rollback()
            duplicate_failed = True

        assert duplicate_failed is True, "Database constraint failed to block duplicate daily attendance!"

        # 4. Verify cascade deletion of biometric record
        db.delete(student)
        db.commit()

        # Confirm student is gone
        deleted_student = db.execute(select(Student).where(Student.roll_number == test_roll)).scalar_one_or_none()
        assert deleted_student is None

        # Confirm attendance was cascade-deleted
        leftover_att = db.execute(select(Attendance).where(Attendance.student_id == student.id)).fetchall()
        assert len(leftover_att) == 0

        print("\n--> NEON PGVECTOR + UNIQUE CONSTRAINT + CASCADE DELETION TEST PASSED! <--\n")

    finally:
        db.close()
