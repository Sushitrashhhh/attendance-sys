from datetime import datetime, date, time
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Float,
    Date,
    Time,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.db.database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    roll_number = Column(String(50), nullable=False, unique=True, index=True)
    branch = Column(String(100), nullable=False)
    semester = Column(Integer, nullable=False)
    # ArcFace embedding: 512-dimensional L2-normalized float vector
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

    def __repr__(self) -> str:
        return f"<Student id={self.id} roll_number='{self.roll_number}' name='{self.name}'>"


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
    status = Column(String(20), nullable=False, default="present")
    confidence = Column(Float, nullable=False)
    liveness_score = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    student = relationship("Student", back_populates="attendances")

    __table_args__ = (
        # Guarantees exactly one attendance record per student per calendar date
        UniqueConstraint("student_id", "attendance_date", name="uq_student_attendance_date"),
    )

    def __repr__(self) -> str:
        return (
            f"<Attendance id={self.id} student_id={self.student_id} "
            f"date={self.attendance_date} status='{self.status}'>"
        )
