from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Excusal
from app.repositories.student_repo import StudentRepository

router = APIRouter(prefix="/api/excusals", tags=["Excused absences"])

MAX_RANGE_DAYS = 180


class ExcusalCreate(BaseModel):
    student_id: int
    date_from: date
    date_to: date
    reason: str = Field(..., min_length=2, max_length=200)

    @model_validator(mode="after")
    def check(self):
        if self.date_to < self.date_from:
            raise ValueError("The end date can't be before the start date.")
        if (self.date_to - self.date_from) > timedelta(days=MAX_RANGE_DAYS):
            raise ValueError(f"An excused absence can cover at most {MAX_RANGE_DAYS} days.")
        self.reason = self.reason.strip()
        return self


class ExcusalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    date_from: date
    date_to: date
    reason: str
    created_at: datetime


@router.get("", response_model=List[ExcusalRead])
def list_excusals(student_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    stmt = select(Excusal).order_by(Excusal.date_from.desc())
    if student_id is not None:
        stmt = stmt.where(Excusal.student_id == student_id)
    return db.execute(stmt).scalars().all()


@router.post("", response_model=ExcusalRead, status_code=status.HTTP_201_CREATED)
def create_excusal(payload: ExcusalCreate, db: Session = Depends(get_db)):
    """Excuse a student for a date range; those class days stop counting against them."""
    if not StudentRepository(db).get_by_id(payload.student_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Student with ID {payload.student_id} not found.")
    excusal = Excusal(**payload.model_dump())
    db.add(excusal)
    db.commit()
    db.refresh(excusal)
    return excusal


@router.delete("/{excusal_id}")
def delete_excusal(excusal_id: int, db: Session = Depends(get_db)):
    excusal = db.get(Excusal, excusal_id)
    if not excusal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Excused absence {excusal_id} not found.")
    db.delete(excusal)
    db.commit()
    return {"success": True}
