"""Add attendance.method to tell camera scans apart from manual marks

Revision ID: 0002_attendance_method
Revises: 0001_initial_schema
Create Date: 2026-09-28 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_attendance_method"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "attendance",
        sa.Column("method", sa.String(length=10), server_default=sa.text("'face'"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("attendance", "method")
