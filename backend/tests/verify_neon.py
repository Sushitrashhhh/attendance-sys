from app.db.database import SessionLocal
from sqlalchemy import text

def verify():
    db = SessionLocal()
    try:
        # Check pgvector extension
        ext = db.execute(text("SELECT extname FROM pg_extension WHERE extname = 'vector'")).scalar()
        print(f"PGVECTOR EXTENSION: {ext}")
        assert ext == "vector", "pgvector extension not found!"

        # Check public tables
        tables = [r[0] for r in db.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).fetchall()]
        print(f"PUBLIC TABLES: {tables}")
        assert "students" in tables, "students table missing!"
        assert "attendance" in tables, "attendance table missing!"
        assert "alembic_version" in tables, "alembic_version table missing!"

        # Check vector column definition
        col_type = db.execute(text(
            "SELECT udt_name FROM information_schema.columns WHERE table_name='students' AND column_name='embedding'"
        )).scalar()
        print(f"STUDENTS.EMBEDDING TYPE: {col_type}")
        assert col_type == "vector", f"Expected vector column type, got {col_type}"

        # Check unique constraint on attendance
        constraints = [r[0] for r in db.execute(text(
            "SELECT conname FROM pg_constraint WHERE conrelid = 'attendance'::regclass"
        )).fetchall()]
        print(f"ATTENDANCE CONSTRAINTS: {constraints}")
        assert "uq_student_attendance_date" in constraints, "uq_student_attendance_date missing!"

        print("\n--> NEON POSTGRESQL + PGVECTOR VERIFICATION SUCCESSFUL! <--\n")
    finally:
        db.close()

if __name__ == "__main__":
    verify()
