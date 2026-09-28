from datetime import datetime, time
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class LectureCreate(BaseModel):
    subject: str = Field(..., min_length=2, max_length=100)
    branch: Optional[str] = Field(None, max_length=100, description="Only students of this branch are marked")
    semester: Optional[int] = Field(None, ge=1, le=12, description="Only students of this semester are marked")
    weekday: int = Field(..., ge=0, le=6, description="0 = Monday ... 6 = Sunday")
    start_time: time
    end_time: time
    late_after_minutes: int = Field(10, ge=0, le=180)

    @model_validator(mode="after")
    def check(self):
        if self.end_time <= self.start_time:
            raise ValueError("End time must be after start time.")
        self.subject = self.subject.strip()
        self.branch = (self.branch or "").strip() or None
        return self


class LectureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    branch: Optional[str]
    semester: Optional[int]
    weekday: int
    start_time: time
    end_time: time
    late_after_minutes: int
    created_at: datetime
