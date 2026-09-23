import pytest
import numpy as np
from datetime import date
from app.db.database import get_db_context
from app.repositories.student_repo import StudentRepository
from app.repositories.attendance_repo import AttendanceRepository


def test_student_and_attendance_lifecycle():
    """Verify end-to-end student persistence, pgvector similarity search, and idempotent attendance."""
    with get_db_context() as db:
        student_repo = StudentRepository(db)
        att_repo = AttendanceRepository(db)

        test_roll = "TEST_CS_9999"
        # Cleanup if previously left over
        old = student_repo.get_by_roll_number(test_roll)
        if old:
            student_repo.delete(old.id)

        # 1. Generate normalized test embedding
        rng = np.random.default_rng(42)
        raw_vec = rng.standard_normal(512).astype(np.float32)
        norm_vec = raw_vec / np.linalg.norm(raw_vec)
        test_emb = [float(x) for x in norm_vec]

        # 2. Create student
        student = student_repo.create(
            name="Automated Test Student",
            roll_number=test_roll,
            branch="Computer Science",
            semester=6,
            embedding=test_emb,
        )
        assert student.id is not None
        assert student.roll_number == test_roll

        try:
            # 3. Query nearest vector (exact same vector should yield ~1.0 similarity)
            nearest = student_repo.find_nearest(test_emb)
            assert nearest is not None
            matched_student, similarity = nearest
            assert matched_student.id == student.id
            assert similarity > 0.99

            # 4. Mark attendance for today
            rec1, status1 = att_repo.mark_attendance(
                student_id=student.id,
                confidence=similarity,
                liveness_score=0.95,
                status="present",
            )
            assert status1 == "marked"
            assert rec1.student_id == student.id

            # 5. Idempotent check: mark attendance AGAIN on same day
            rec2, status2 = att_repo.mark_attendance(
                student_id=student.id,
                confidence=similarity,
                liveness_score=0.95,
                status="present",
            )
            assert status2 == "already_marked"
            assert rec2.id == rec1.id

            # 6. Verify analytics includes our student
            overview = att_repo.get_analytics_overview()
            assert overview["total_students"] >= 1
            assert overview["present_today"] >= 1

        finally:
            # 7. Clean up: Delete student (cascades and purges attendance and biometrics)
            deleted = student_repo.delete(student.id)
            assert deleted is True
            assert student_repo.get_by_id(student.id) is None
