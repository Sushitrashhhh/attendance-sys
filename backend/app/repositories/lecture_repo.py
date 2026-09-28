from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Lecture


class LectureRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_active(self) -> List[Lecture]:
        stmt = (
            select(Lecture)
            .where(Lecture.active.is_(True))
            .order_by(Lecture.weekday, Lecture.start_time, Lecture.subject)
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_active(self, lecture_id: int) -> Optional[Lecture]:
        lecture = self.db.get(Lecture, lecture_id)
        return lecture if lecture and lecture.active else None

    def create(self, **fields) -> Lecture:
        lecture = Lecture(**fields)
        self.db.add(lecture)
        self.db.commit()
        self.db.refresh(lecture)
        return lecture

    def deactivate(self, lecture_id: int) -> bool:
        lecture = self.get_active(lecture_id)
        if not lecture:
            return False
        lecture.active = False
        self.db.commit()
        return True
