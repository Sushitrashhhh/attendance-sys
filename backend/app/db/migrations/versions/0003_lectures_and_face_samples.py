"""Lectures (timetable), per-lecture attendance with late marking, learned face samples

Revision ID: 0003_lectures_and_face_samples
Revises: 0002_attendance_method
Create Date: 2026-09-28 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision: str = "0003_lectures_and_face_samples"
down_revision: Union[str, None] = "0002_attendance_method"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lectures",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("subject", sa.String(length=100), nullable=False),
        sa.Column("branch", sa.String(length=100), nullable=True),
        sa.Column("semester", sa.Integer(), nullable=True),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("late_after_minutes", sa.Integer(), server_default=sa.text("10"), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_lectures_weekday"),
        sa.CheckConstraint("end_time > start_time", name="ck_lectures_time_order"),
    )

    op.add_column("attendance", sa.Column("lecture_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_attendance_lecture", "attendance", "lectures", ["lecture_id"], ["id"])
    op.create_index("ix_attendance_lecture_id", "attendance", ["lecture_id"])

    # One record per student per date per lecture (NULL lecture = whole-day check-in, still unique)
    op.drop_constraint("uq_student_attendance_date", "attendance", type_="unique")
    op.create_index(
        "uq_attendance_student_date_lecture",
        "attendance",
        ["student_id", "attendance_date", "lecture_id"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )

    op.create_table(
        "face_samples",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("embedding", Vector(512), nullable=False),
        sa.Column("similarity", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_face_samples_student_id", "face_samples", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_face_samples_student_id", table_name="face_samples")
    op.drop_table("face_samples")

    # Fails if a student has more than one record on the same date (i.e. lecture attendance exists)
    op.drop_index("uq_attendance_student_date_lecture", table_name="attendance")
    op.create_unique_constraint("uq_student_attendance_date", "attendance", ["student_id", "attendance_date"])

    op.drop_index("ix_attendance_lecture_id", table_name="attendance")
    op.drop_constraint("fk_attendance_lecture", "attendance", type_="foreignkey")
    op.drop_column("attendance", "lecture_id")
    op.drop_table("lectures")
