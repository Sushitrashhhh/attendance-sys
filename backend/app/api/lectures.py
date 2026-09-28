from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Lecture
from app.repositories.lecture_repo import LectureRepository
from app.schemas.lecture import LectureCreate, LectureRead

router = APIRouter(prefix="/api/lectures", tags=["Lectures"])


def optional_lecture(
    lecture_id: Optional[int] = Query(None, description="Timetable lecture; omit for the whole day"),
    db: Session = Depends(get_db),
) -> Optional[Lecture]:
    """Shared query dependency: resolve ?lecture_id= to an active Lecture (404 if unknown)."""
    if lecture_id is None:
        return None
    lecture = LectureRepository(db).get_active(lecture_id)
    if lecture is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture {lecture_id} not found.")
    return lecture


@router.get("", response_model=List[LectureRead])
def list_lectures(db: Session = Depends(get_db)):
    """The weekly timetable, ordered by day and start time."""
    return LectureRepository(db).list_active()


@router.post("", response_model=LectureRead, status_code=status.HTTP_201_CREATED)
def create_lecture(payload: LectureCreate, db: Session = Depends(get_db)):
    return LectureRepository(db).create(**payload.model_dump())


@router.delete("/{lecture_id}")
def delete_lecture(lecture_id: int, db: Session = Depends(get_db)):
    """Remove a lecture from the timetable. Past attendance for it is kept."""
    if not LectureRepository(db).deactivate(lecture_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Lecture {lecture_id} not found.")
    return {"success": True}
