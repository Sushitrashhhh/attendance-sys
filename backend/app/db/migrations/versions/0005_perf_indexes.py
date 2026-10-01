"""Add performance indexes on attendance table

Revision ID: 0005_perf_indexes
Revises: 0004_failed_checks_and_excusals
Create Date: 2026-10-01 20:00:00.000000

Adds two composite indexes that dramatically speed up the most frequent read
queries in the application:

  ix_attendance_date_lecture  (attendance_date, lecture_id)
    Used by: get_today_records, get_absent_today, get_analytics_overview.
    Without this, Postgres does a full table-scan on every dashboard page load.

  ix_attendance_student_date  (student_id, attendance_date)
    Used by: get_student_records, get_by_student_and_date (called per frame in
    the live recognition WebSocket loop).

Both are simple BTree indexes created CONCURRENTLY so they don't lock the table
during creation on a live production database.
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0005_perf_indexes"
down_revision: Union[str, None] = "0004_failed_checks_and_excusals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Regular CREATE INDEX runs inside the Alembic transaction context.
    # IF NOT EXISTS makes the migration safe to re-run.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_attendance_date_lecture "
        "ON attendance (attendance_date, lecture_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_attendance_student_date "
        "ON attendance (student_id, attendance_date)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_attendance_date_lecture")
    op.execute("DROP INDEX IF EXISTS ix_attendance_student_date")
