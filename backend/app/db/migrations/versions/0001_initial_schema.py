"""Initial schema with pgvector, students, and attendance tables

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-09-05 15:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable pgvector extension in PostgreSQL
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    # 2. Create students table
    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("roll_number", sa.String(length=50), nullable=False),
        sa.Column("branch", sa.String(length=100), nullable=False),
        sa.Column("semester", sa.Integer(), nullable=False),
        sa.Column("embedding", Vector(512), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("roll_number", name="uq_students_roll_number"),
    )
    op.create_index("ix_students_id", "students", ["id"], unique=False)
    op.create_index("ix_students_roll_number", "students", ["roll_number"], unique=True)
    op.create_index("ix_students_active", "students", ["active"], unique=False)

    # 3. Create attendance table
    op.create_table(
        "attendance",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("attendance_date", sa.Date(), server_default=sa.text("CURRENT_DATE"), nullable=False),
        sa.Column("attendance_time", sa.Time(), server_default=sa.text("CURRENT_TIME"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'present'"), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("liveness_score", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "attendance_date", name="uq_student_attendance_date"),
    )
    op.create_index("ix_attendance_id", "attendance", ["id"], unique=False)
    op.create_index("ix_attendance_student_id", "attendance", ["student_id"], unique=False)
    op.create_index("ix_attendance_date", "attendance", ["attendance_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_attendance_date", table_name="attendance")
    op.drop_index("ix_attendance_student_id", table_name="attendance")
    op.drop_index("ix_attendance_id", table_name="attendance")
    op.drop_table("attendance")

    op.drop_index("ix_students_active", table_name="students")
    op.drop_index("ix_students_roll_number", table_name="students")
    op.drop_index("ix_students_id", table_name="students")
    op.drop_table("students")
