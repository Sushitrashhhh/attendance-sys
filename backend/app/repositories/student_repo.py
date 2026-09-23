from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_
from app.db.models import Student


class StudentRepository:
    """Repository handling Student persistence and pgvector similarity queries."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, student_id: int) -> Optional[Student]:
        stmt = select(Student).where(Student.id == student_id, Student.active.is_(True))
        return self.db.execute(stmt).scalars().first()

    def get_by_roll_number(self, roll_number: str) -> Optional[Student]:
        stmt = select(Student).where(
            func.lower(Student.roll_number) == roll_number.strip().lower(),
            Student.active.is_(True),
        )
        return self.db.execute(stmt).scalars().first()

    def create(
        self,
        name: str,
        roll_number: str,
        branch: str,
        semester: int,
        embedding: List[float],
    ) -> Student:
        student = Student(
            name=name.strip(),
            roll_number=roll_number.strip().upper(),
            branch=branch.strip(),
            semester=semester,
            embedding=embedding,
            active=True,
        )
        self.db.add(student)
        self.db.commit()
        self.db.refresh(student)
        return student

    def list_students(
        self,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
    ) -> Tuple[List[Student], int]:
        query = select(Student).where(Student.active.is_(True))

        if search and search.strip():
            term = f"%{search.strip().lower()}%"
            query = query.where(
                or_(
                    func.lower(Student.name).like(term),
                    func.lower(Student.roll_number).like(term),
                    func.lower(Student.branch).like(term),
                )
            )

        # Count total matching
        count_stmt = select(func.count()).select_from(query.subquery())
        total = self.db.execute(count_stmt).scalar() or 0

        # Fetch page ordered by roll_number
        fetch_stmt = query.order_by(Student.roll_number.asc()).offset(skip).limit(limit)
        items = list(self.db.execute(fetch_stmt).scalars().all())

        return items, total

    def delete(self, student_id: int) -> bool:
        student = self.get_by_id(student_id)
        if not student:
            return False
        # Soft delete or hard delete; prompt specified:
        # "When student is deleted, their attendance records and biometric embeddings are permanently removed"
        self.db.delete(student)
        self.db.commit()
        return True

    def find_nearest(
        self, query_embedding: List[float]
    ) -> Optional[Tuple[Student, float]]:
        """
        Query Neon pgvector for the closest student biometric vector using cosine distance (<=>).
        Cosine distance in pgvector is 1 - cosine_similarity (for normalized vectors).
        Returns: Tuple[Student, similarity_score] where similarity_score = 1 - distance,
        or None if no students exist.
        """
        distance_col = Student.embedding.cosine_distance(query_embedding).label("distance")
        stmt = (
            select(Student, distance_col)
            .where(Student.active.is_(True))
            .order_by(distance_col.asc())
            .limit(1)
        )
        result = self.db.execute(stmt).first()
        if not result:
            return None

        student, distance = result
        similarity = max(0.0, min(1.0, 1.0 - float(distance)))
        return student, similarity
