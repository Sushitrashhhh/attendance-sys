"""Failed head-turn checks (proxy-attempt flags) and excused absences

Revision ID: 0004_failed_checks_and_excusals
Revises: 0003_lectures_and_face_samples
Create Date: 2026-09-28 18:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004_failed_checks_and_excusals"
down_revision: Union[str, None] = "0003_lectures_and_face_samples"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "failed_checks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("lecture_id", sa.Integer(), nullable=True),
        sa.Column("check_date", sa.Date(), nullable=False),
        sa.Column("check_time", sa.Time(), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_failed_checks_student_id", "failed_checks", ["student_id"])
    op.create_index("ix_failed_checks_check_date", "failed_checks", ["check_date"])

    op.create_table(
        "excusals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("date_to >= date_from", name="ck_excusals_date_order"),
    )
    op.create_index("ix_excusals_student_id", "excusals", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_excusals_student_id", table_name="excusals")
    op.drop_table("excusals")
    op.drop_index("ix_failed_checks_check_date", table_name="failed_checks")
    op.drop_index("ix_failed_checks_student_id", table_name="failed_checks")
    op.drop_table("failed_checks")
