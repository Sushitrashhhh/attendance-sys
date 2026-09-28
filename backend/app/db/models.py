from sqlalchemy import (
    CheckConstraint,
    Column,
    Integer,
    String,
    Boolean,
    Float,
    Date,
    Time,
    DateTime,
    ForeignKey,
    Index,
    func,
    select,
)
from sqlalchemy.orm import column_property, relationship
from pgvector.sqlalchemy import Vector
from app.db.database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    roll_number = Column(String(50), nullable=False, unique=True, index=True)
    branch = Column(String(100), nullable=False)
    semester = Column(Integer, nullable=False)
    # ArcFace embedding: 512-dimensional L2-normalized float vector (from enrollment)
    embedding = Column(Vector(512), nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # When student is deleted, their attendance records and biometric embeddings are permanently removed
    attendances = relationship(
        "Attendance",
        back_populates="student",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    face_samples = relationship(
        "FaceSample",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<Student id={self.id} roll_number='{self.roll_number}' name='{self.name}'>"


class Lecture(Base):
    """A weekly timetable slot, e.g. "DBMS, Mon 10:00-11:00, Computer Science sem 5"."""

    __tablename__ = "lectures"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subject = Column(String(100), nullable=False)
    # Optional class restriction: only students of this branch / semester get marked
    branch = Column(String(100), nullable=True)
    semester = Column(Integer, nullable=True)
    weekday = Column(Integer, nullable=False)  # 0 = Monday ... 6 = Sunday
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    late_after_minutes = Column(Integer, nullable=False, default=10, server_default="10")
    # Removing a lecture only hides it, so past attendance keeps its subject
    active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attendance_date = Column(Date, nullable=False, server_default=func.current_date())
    attendance_time = Column(Time, nullable=False, server_default=func.current_time())
    status = Column(String(20), nullable=False, default="present")  # present | late
    confidence = Column(Float, nullable=False)
    liveness_score = Column(Float, nullable=False)
    # "face" = marked by the camera, "manual" = marked by staff from the dashboard
    method = Column(String(10), nullable=False, default="face", server_default="face")
    # NULL = whole-day check-in (no lecture selected)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    student = relationship("Student", back_populates="attendances")
    lecture = relationship("Lecture")

    __table_args__ = (
        # One record per student per date per lecture. NULLS NOT DISTINCT keeps the
        # whole-day record (lecture_id NULL) unique per date as well.
        Index(
            "uq_attendance_student_date_lecture",
            "student_id",
            "attendance_date",
            "lecture_id",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Attendance id={self.id} student_id={self.student_id} "
            f"date={self.attendance_date} status='{self.status}'>"
        )


class FaceSample(Base):
    """Extra embeddings learned from confident live check-ins, so recognition follows
    gradual appearance changes (beard, glasses, haircut)."""

    __tablename__ = "face_samples"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    embedding = Column(Vector(512), nullable=False)
    similarity = Column(Float, nullable=False)  # match score at the moment it was learned
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FailedCheck(Base):
    """A head-turn challenge that timed out. Several in one day for one student is flagged
    as a possible proxy attempt (someone holding up a photo or playing a video)."""

    __tablename__ = "failed_checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id"), nullable=True)
    check_date = Column(Date, nullable=False, index=True)
    check_time = Column(Time, nullable=False)


class Excusal(Base):
    """Excused absence (medical, leave, college event) over an inclusive date range.
    Excused class days are left out of a student's attendance percentage."""

    __tablename__ = "excusals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    date_from = Column(Date, nullable=False)
    date_to = Column(Date, nullable=False)
    reason = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (CheckConstraint("date_to >= date_from", name="ck_excusals_date_order"),)


Student.learned_samples = column_property(
    select(func.count(FaceSample.id))
    .where(FaceSample.student_id == Student.id)
    .correlate_except(FaceSample)
    .scalar_subquery()
)
