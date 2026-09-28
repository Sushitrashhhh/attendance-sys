from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import delete, select, func, or_, union_all
from app.db.models import FaceSample, Student


def _similarity(cosine_distance) -> float:
    return max(0.0, min(1.0, 1.0 - float(cosine_distance)))


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

    def update(self, student: Student, **fields) -> Student:
        for key, value in fields.items():
            if value is None:
                continue
            value = value.strip() if isinstance(value, str) else value
            if key == "roll_number":
                value = value.upper()
            setattr(student, key, value)
        self.db.commit()
        self.db.refresh(student)
        return student

    def delete(self, student_id: int) -> bool:
        student = self.get_by_id(student_id)
        if not student:
            return False
        # Soft delete or hard delete; prompt specified:
        # "When student is deleted, their attendance records and biometric embeddings are permanently removed"
        self.db.delete(student)
        self.db.commit()
        return True

    def match(
        self, query_embedding: List[float]
    ) -> Optional[Tuple[Student, float, float]]:
        """
        Closest student by cosine distance (<=>) over the enrollment embedding AND any learned
        face samples. Returns (student, similarity, runner_up_similarity) where runner-up is the
        best score of any *other* student (0.0 if none), or None if no students exist.
        """
        enrolled = select(
            Student.id.label("sid"),
            Student.embedding.cosine_distance(query_embedding).label("d"),
        ).where(Student.active.is_(True))
        learned = (
            select(
                FaceSample.student_id.label("sid"),
                FaceSample.embedding.cosine_distance(query_embedding).label("d"),
            )
            .join(Student, Student.id == FaceSample.student_id)
            .where(Student.active.is_(True))
        )
        candidates = union_all(enrolled, learned).subquery()
        best_d = func.min(candidates.c.d).label("best_d")
        top2 = self.db.execute(
            select(candidates.c.sid, best_d).group_by(candidates.c.sid).order_by(best_d.asc()).limit(2)
        ).all()
        if not top2:
            return None

        student = self.db.get(Student, top2[0].sid)
        runner_up = _similarity(top2[1].best_d) if len(top2) > 1 else 0.0
        return student, _similarity(top2[0].best_d), runner_up

    def find_nearest(self, query_embedding: List[float]) -> Optional[Tuple[Student, float]]:
        """Closest student and similarity (see match)."""
        result = self.match(query_embedding)
        return (result[0], result[1]) if result else None

    def add_face_sample(self, student_id: int, embedding: List[float], similarity: float, keep: int) -> None:
        """Store a learned embedding, keeping only the `keep` most recent samples per student."""
        self.db.add(FaceSample(student_id=student_id, embedding=embedding, similarity=round(similarity, 4)))
        self.db.flush()
        stale = self.db.execute(
            select(FaceSample.id)
            .where(FaceSample.student_id == student_id)
            .order_by(FaceSample.created_at.desc(), FaceSample.id.desc())
            .offset(keep)
        ).scalars().all()
        if stale:
            self.db.execute(delete(FaceSample).where(FaceSample.id.in_(stale)))
        self.db.commit()

    def clear_face_samples(self, student_id: int) -> int:
        """Forget everything learned for a student; recognition falls back to the enrollment photo."""
        removed = self.db.execute(delete(FaceSample).where(FaceSample.student_id == student_id)).rowcount
        self.db.commit()
        return removed or 0
